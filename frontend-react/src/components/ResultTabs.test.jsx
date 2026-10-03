import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ResultTabs from "./ResultTabs.jsx";

it("makes overflowing result categories keyboard reachable without changing their ownership", () => {
  const views = [{ id: "rf", label: "RF" }, { id: "optimization", label: "Optimization" }, { id: "interference", label: "Interference" }, { id: "compare", label: "Compare" }, { id: "recommendations", label: "Candidates" }];
  const onChange = vi.fn();
  render(<ResultTabs value="rf" views={views} onChange={onChange} />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(views.map((view) => view.label));
  const rf = screen.getByRole("tab", { name: "RF" });
  rf.focus();
  fireEvent.keyDown(rf, { key: "End" });
  expect(screen.getByRole("tab", { name: "Candidates" })).toHaveFocus();
  expect(onChange).toHaveBeenLastCalledWith("recommendations");
  fireEvent.keyDown(document.activeElement, { key: "ArrowRight" });
  expect(rf).toHaveFocus();
  expect(onChange).toHaveBeenLastCalledWith("rf");
});
