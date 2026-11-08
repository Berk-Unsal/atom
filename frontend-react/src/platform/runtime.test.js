import { describe, expect, it, vi } from "vitest";
import { createRuntimeGuard } from "./runtime.js";

const generation = "a".repeat(32);
const nextGeneration = "b".repeat(32);
const ready = (sequence = 1, current = generation) => ({ sequence, state: "ready", generation: current });

function runtime() {
  let status = ready(); let listener;
  const bridge = { getRuntime: vi.fn(async () => status), onRuntimeChange: vi.fn((callback) => { listener = callback; }) };
  return { bridge, guard: createRuntimeGuard(bridge), change(next, notify = true) { status = next; if (notify) listener?.(next); } };
}

describe("desktop runtime leases", () => {
  it("invalidates every in-flight request on crash/restart without retrying it", async () => {
    const host = runtime();
    const first = await host.guard.begin();
    const second = await host.guard.begin();
    host.change({ sequence: 2, state: "failed", generation });
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(() => first.assertCurrent()).toThrow("service changed");
    await expect(host.guard.begin()).rejects.toMatchObject({ code: "runtime_changed" });
    host.change(ready(3, nextGeneration));
    expect((await host.guard.begin()).generation).toBe(nextGeneration);
    first.close(); second.close();
    expect(host.bridge.onRuntimeChange).toHaveBeenCalledTimes(1);
  });

  it("rechecks the host after the body even when the change event has not arrived", async () => {
    const host = runtime(); const lease = await host.guard.begin();
    host.change(ready(2, nextGeneration), false);
    await expect(lease.finish()).rejects.toMatchObject({ code: "runtime_changed" });
    expect(lease.signal.aborted).toBe(true);
    lease.close();
  });

  it("cannot roll back a newer notification with a delayed bootstrap reply", async () => {
    let reply; let notify;
    const guard = createRuntimeGuard({ getRuntime: () => new Promise((resolve) => { reply = resolve; }), onRuntimeChange: (callback) => { notify = callback; } });
    const pending = guard.begin();
    notify(ready(2, nextGeneration)); reply(ready());
    const lease = await pending;
    expect(lease.generation).toBe(nextGeneration);
    lease.close();
  });

  it("rejects absent/wrong response generations and preserves caller cancellation", async () => {
    const host = runtime(); const controller = new AbortController(); const lease = await host.guard.begin(controller.signal);
    expect(() => lease.validateResponse({ headers: new Headers() })).toThrow("service changed");
    expect(() => lease.validateResponse({ headers: new Headers({ "X-Atom-Runtime-Generation": nextGeneration }) })).toThrow("service changed");
    expect(() => lease.validateResponse({ headers: new Headers({ "X-Atom-Runtime-Generation": generation }) })).not.toThrow();
    controller.abort(); expect(lease.signal.aborted).toBe(true);
    expect(() => lease.assertCurrent()).not.toThrow();
    lease.close();
  });

  it("keeps a multi-request user action bound even between HTTP calls", async () => {
    const host = runtime(); const first = await host.guard.begin(); first.close();
    const action = new AbortController(); host.guard.bindOperation(action.signal);
    const valid = host.guard.captureOperation();
    host.change(ready(2, nextGeneration));
    expect(valid()).toBe(false);
    await expect(host.guard.begin(action.signal)).rejects.toMatchObject({ code: "runtime_changed" });
    expect((await host.guard.begin(new AbortController().signal)).generation).toBe(nextGeneration);
  });
});
