import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OptimizationOperationFeedback from "./OptimizationOperationFeedback.jsx";
import { describeOptimizationScope } from "../utils/optimizationOperation.js";

function operation() {
  return {
    startedAt: performance.now(),
    signal: new AbortController().signal,
    scope: describeOptimizationScope({ towers: Array(6).fill({}) }),
  };
}

describe("optimization operation timing", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }));
  afterEach(() => vi.useRealTimers());
  const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

  it("announces once, discloses after 500 ms, and measures elapsed time quietly", () => {
    render(<OptimizationOperationFeedback operation={operation()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Optimizing network");
    advance(250);
    expect(screen.queryByLabelText("Network optimization activity")).not.toBeInTheDocument();
    advance(250);
    const feedback = screen.getByLabelText("Network optimization activity");
    expect(feedback).toHaveAttribute("aria-live", "off");
    expect(feedback).toHaveTextContent("6 cells · 2 passes · 434 proposals");
    expect(feedback).toHaveTextContent("0.5 s elapsed");
    advance(1500);
    expect(feedback).toHaveTextContent("2.0 s elapsed");
    expect(screen.getByRole("status")).toHaveTextContent(/^Optimizing network$/);
  });

  it("uses truthful supporting copy at 10 and 30 seconds", () => {
    render(<OptimizationOperationFeedback operation={operation()} />);
    advance(10_000);
    expect(screen.getByText("Taking longer than usual")).toBeInTheDocument();
    expect(screen.getByText("Optimization is still running.")).toBeInTheDocument();
    advance(20_000);
    expect(screen.getByText("Still optimizing")).toBeInTheDocument();
    expect(screen.getByText("Complex geometry or search settings can require more time.")).toBeInTheDocument();
    expect(screen.getByText("30.0 s elapsed")).toBeInTheDocument();
  });

  it("retains elapsed time when returning to the tool", () => {
    const active = operation();
    advance(4500);
    render(<OptimizationOperationFeedback operation={active} />);
    expect(screen.getByText("4.5 s elapsed")).toBeInTheDocument();
  });

  it("clears timing on unmount", () => {
    const view = render(<OptimizationOperationFeedback operation={operation()} />);
    advance(1000);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(30_000);
    expect(screen.queryByLabelText("Network optimization activity")).not.toBeInTheDocument();
  });

  it("stops the interval immediately on abort", () => {
    const controller = new AbortController();
    render(<OptimizationOperationFeedback operation={{ ...operation(), signal: controller.signal }} />);
    advance(1000);
    act(() => controller.abort());
    expect(vi.getTimerCount()).toBe(0);
    advance(10_000);
    expect(screen.getByText("1.0 s elapsed")).toBeInTheDocument();
  });
});
