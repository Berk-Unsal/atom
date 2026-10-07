import { afterEach, describe, expect, it, vi } from "vitest";
import { createRFWorkflow, supportsRFWorkflow, RF_BUDGET_POLICY } from "./rfWorkflow.js";
const id = "a".repeat(32);
const meta = { rf_budget_policy: RF_BUDGET_POLICY };
const grant = (count = 2, overrides = {}) => new Response(JSON.stringify({ optimal_azimuth: 45 }), {
  headers: { "Content-Type": "application/json", "RF-Budget-Policy": RF_BUDGET_POLICY, "RF-Workflow-ID": id,
    "RF-Workflow-Remaining": String(count), "RF-Workflow-Expires": "60", ...overrides },
});
const ok = () => new Response("{}", { headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
describe("bounded RF workflows", () => {
  it("requires the advertised capability", () => {
    expect(supportsRFWorkflow(meta)).toBe(true);
    for (const value of [null, {}, { rf_budget_policy: "future" }]) expect(supportsRFWorkflow(value)).toBe(false);
  });
  it("keeps legacy roots/children ordinary without retries", async () => {
    const fetch = vi.fn().mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetch);
    const flow = createRFWorkflow({}, new AbortController().signal);
    await flow.root("/api/evaluate-network", {}, "failed", 2); await flow.child("/api/simulate", {}, "failed", 0); await flow.close();
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) expect(options.headers).toEqual({ "Content-Type": "application/json" });
  });
  it("propagates ordered indexes and returned winning angles", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(grant()).mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetch);
    const flow = createRFWorkflow(meta, new AbortController().signal);
    const result = await flow.root("/api/optimize-network", {}, "failed", 2);
    await flow.child("/api/simulate", { azimuth: result.optimal_azimuth }, "failed", 0);
    await expect(flow.child("/api/simulate", {}, "failed", 0)).rejects.toThrow("unavailable");
    await flow.child("/api/simulate", { azimuth: 90 }, "failed", 1); await flow.close();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0][1].headers["RF-Workflow"]).toBe("network-maps-v1");
    expect(fetch.mock.calls[1][1].headers).toMatchObject({ "RF-Workflow-ID": id, "RF-Workflow-Index": "0" });
    expect(fetch.mock.calls[2][1].headers["RF-Workflow-Index"]).toBe("1");
    expect(JSON.parse(fetch.mock.calls[1][1].body).azimuth).toBe(45);
  });
  it("uses the Azimuth intent and Sector index zero", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(grant(1)).mockResolvedValueOnce(ok()); vi.stubGlobal("fetch", fetch);
    const flow = createRFWorkflow(meta); await flow.root("/api/optimize-azimuth", {}, "failed", 1);
    await flow.child("/api/analyze-sector", { azimuth: 45 }, "failed", 0); await flow.close();
    expect(fetch.mock.calls[0][1].headers["RF-Workflow"]).toBe("azimuth-sector-v1");
    expect(fetch.mock.calls[1][1].headers["RF-Workflow-Index"]).toBe("0");
  });
  it.each([{ "RF-Workflow-ID": "" }, { "RF-Workflow-Remaining": "3" }, { "RF-Workflow-Expires": "0" }, { "RF-Budget-Policy": "" }])("fails closed on grant %j", async (overrides) => {
    const fetch = vi.fn().mockResolvedValueOnce(grant(2, overrides)).mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
    const flow = createRFWorkflow(meta); await expect(flow.root("/api/evaluate-network", {}, "failed", 2)).rejects.toThrow("metadata"); await flow.close();
    expect(fetch.mock.calls.filter(([path]) => path === "/api/simulate")).toHaveLength(0);
  });
  it("cleans failed/aborted queues once with an independent signal", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValueOnce(grant()).mockRejectedValueOnce(new Error("map failed")).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
    const flow = createRFWorkflow(meta, controller.signal); await flow.root("/api/evaluate-network", {}, "failed", 2);
    await expect(flow.child("/api/simulate", {}, "failed", 0)).rejects.toThrow("map failed"); controller.abort(); await flow.close();
    expect(fetch.mock.calls[2][0]).toBe("/api/rf-workflows");
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: "DELETE", headers: { "RF-Workflow-ID": id } });
    expect(fetch.mock.calls[2][1].signal).not.toBe(controller.signal); expect(fetch.mock.calls[2][1].signal.aborted).toBe(false); expect(fetch).toHaveBeenCalledTimes(3);
  });
});
