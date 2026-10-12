import { fireEvent, render, screen } from "@testing-library/react";
import { RadioTower } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import AnalysisEmptyState from "./AnalysisEmptyState.jsx";

describe("actionable result empty state", () => {
  it("uses the supplied computation action and preserves its disabled state", () => {
    const onAction = vi.fn();
    const props = { icon: RadioTower, title: "No current RF result", description: "Evaluate the current 6-cell network to generate RF results.", actionLabel: "Evaluate Network", onAction };
    const { rerender } = render(<AnalysisEmptyState {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Evaluate Network" }));
    expect(onAction).toHaveBeenCalledOnce();
    rerender(<AnalysisEmptyState {...props} actionDisabled />);
    fireEvent.click(screen.getByRole("button", { name: "Evaluate Network" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Evaluate Network" })).toBeDisabled();
  });
});
