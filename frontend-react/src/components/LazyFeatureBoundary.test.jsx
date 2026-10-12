import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import DisclosureSection from "./DisclosureSection.jsx";
import LazyFeatureBoundary from "./LazyFeatureBoundary.jsx";

function StatefulResearchFeature() {
  const [value, setValue] = useState(140);
  return (
    <label>
      Research frequency
      <input type="number" value={value} onChange={(event) => setValue(Number(event.target.value))} />
    </label>
  );
}

describe("LazyFeatureBoundary", () => {
  it("does not import a feature until its owning surface becomes active", async () => {
    const load = vi.fn(async () => ({ default: () => <p>Loaded feature</p> }));
    const { rerender } = render(<LazyFeatureBoundary active={false} featureName="Research" load={load} />);

    expect(load).not.toHaveBeenCalled();
    rerender(<LazyFeatureBoundary active featureName="Research" load={load} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("Loaded feature")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a loaded disclosure feature mounted and preserves its local value", async () => {
    const load = vi.fn(async () => ({ default: StatefulResearchFeature }));
    render(
      <DisclosureSection
        title="Research / reference"
        lazyFeature={{ featureName: "Propagation Research", load }}
      />,
    );
    const disclosure = screen.getByRole("button", { name: "Research / reference" });
    expect(load).not.toHaveBeenCalled();

    fireEvent.click(disclosure);
    const input = await screen.findByRole("spinbutton", { name: "Research frequency" });
    fireEvent.change(input, { target: { value: "145" } });
    expect(input).toHaveValue(145);

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toBeVisible();
    fireEvent.click(disclosure);
    const reopenedInput = screen.getByRole("spinbutton", { name: "Research frequency" });
    expect(reopenedInput).toHaveValue(145);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("isolates a rejected import and offers application reload without removing the workspace", async () => {
    const load = vi.fn(() => Promise.reject(new Error("temporary chunk failure")));
    render(
      <main>
        <div aria-label="Planning map">Map remains available</div>
        <LazyFeatureBoundary featureName="Reports" load={load} />
      </main>,
    );

    const error = await screen.findByRole("alert", { name: "Reports could not be loaded" });
    expect(error).toHaveTextContent("The workspace is still available");
    expect(screen.getByText("Map remains available")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload application" })).toBeEnabled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
