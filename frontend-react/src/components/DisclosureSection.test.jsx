import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DisclosureSection from "./DisclosureSection.jsx";

describe("DisclosureSection", () => {
  it("opens Planning by default and reports aria-expanded", () => {
    render(<DisclosureSection title="Planning" description="Common RF settings" defaultOpen><label>Radius<input aria-label="Radius" defaultValue="400" /></label></DisclosureSection>);
    expect(screen.getByRole("button", { name: "Planning" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Radius" })).toBeVisible();
  });

  it("starts closed and keeps child values when collapsed and reopened", () => {
    render(<DisclosureSection title="Advanced" description="Specialist analysis"><label>Receiver margin<input aria-label="Receiver margin" defaultValue="2" /></label></DisclosureSection>);
    const toggle = screen.getByRole("button", { name: "Advanced" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    const input = screen.getByRole("textbox", { name: "Receiver margin" });
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("textbox", { name: "Receiver margin" })).toHaveValue("4");
  });

  it("surfaces attention, opens the section, and focuses an invalid control", () => {
    render(<DisclosureSection title="Advanced" description="Specialist analysis" attention attentionMessage="Advanced settings need attention" focusInvalid><input aria-label="Noise figure" aria-invalid="true" /></DisclosureSection>);
    const toggle = screen.getByRole("button", { name: "Advanced, Advanced settings need attention" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Advanced settings need attention");
    expect(screen.getByRole("textbox", { name: "Noise figure" })).toHaveFocus();
  });

  it("opens and focuses an invalid field when attention appears in a closed section", () => {
    const { rerender } = render(<DisclosureSection title="Advanced"><input type="number" aria-label="TX gain" aria-invalid="true" /></DisclosureSection>);
    const toggle = screen.getByRole("button", { name: "Advanced" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    rerender(<DisclosureSection title="Advanced" attention attentionMessage="Advanced settings need attention" focusInvalid><input type="number" aria-label="TX gain" aria-invalid="true" /></DisclosureSection>);
    expect(screen.getByRole("button", { name: "Advanced, Advanced settings need attention" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("spinbutton", { name: "TX gain" })).toHaveFocus();
  });

  it("labels the research tier and exposes a button with expanded semantics", () => {
    render(<DisclosureSection title="Research / reference" description="Isolated comparison tools" research><p>Sub-THz</p></DisclosureSection>);
    const toggle = screen.getByRole("button", { name: "Research / reference" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Research / reference");
    expect(screen.getByText("Sub-THz")).toBeVisible();
  });
});
