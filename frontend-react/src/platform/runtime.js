const ACTIVE_STATES = new Set(["starting", "loading-dataset", "ready"]);

function runtimeError() {
  const error = new Error("The planning service changed or stopped. Your workspace is preserved. Use Help → Restart planning service if needed, then run the action again.");
  error.code = "runtime_changed";
  return error;
}

/** Runtime leases never retry work. They cover body consumption, not just headers. */
export function createRuntimeGuard(bridge) {
  let status = null;
  let initialized;
  let subscribed = false;
  const leases = new Set();
  const operations = new WeakMap();
  const apply = (next) => {
    if (!Number.isSafeInteger(next?.sequence) || (status && next.sequence <= status.sequence)) return;
    status = next;
    for (const lease of leases) {
      if (lease.generation !== next.generation || !ACTIVE_STATES.has(next.state)) {
        lease.invalidated = true;
        lease.controller.abort();
      }
    }
  };
  const refresh = async () => {
    let timer;
    try {
      apply(await Promise.race([bridge.getRuntime(), new Promise((_, reject) => { timer = setTimeout(() => reject(runtimeError()), 30_000); })]));
    } finally { clearTimeout(timer); }
  };
  const initialize = () => {
    if (!initialized) {
      if (typeof bridge.getRuntime !== "function" || typeof bridge.onRuntimeChange !== "function") throw runtimeError();
      if (!subscribed) { bridge.onRuntimeChange(apply); subscribed = true; }
      initialized = refresh().catch((error) => { initialized = null; throw error; });
    }
    return initialized;
  };
  return {
    bindOperation(signal) { if (signal && status && !operations.has(signal)) operations.set(signal, status.generation); },
    captureOperation() {
      const generation = status?.generation;
      return () => !generation || (status?.generation === generation && ACTIVE_STATES.has(status.state));
    },
    async begin(signal) {
      await initialize();
      if (!ACTIVE_STATES.has(status?.state) || !/^[a-f0-9]{32}$/.test(status?.generation || "")) throw runtimeError();
      if (signal) {
        if (operations.has(signal) && operations.get(signal) !== status.generation) throw runtimeError();
        operations.set(signal, status.generation);
      }
      const lease = { generation: status.generation, controller: new AbortController(), invalidated: false };
      leases.add(lease);
      const assertCurrent = () => { if (lease.invalidated || status.generation !== lease.generation || !ACTIVE_STATES.has(status.state)) throw runtimeError(); };
      return {
        generation: lease.generation,
        signal: signal ? AbortSignal.any([signal, lease.controller.signal]) : lease.controller.signal,
        assertCurrent,
        validateResponse(response) { if (response.headers.get("X-Atom-Runtime-Generation") !== lease.generation) throw runtimeError(); assertCurrent(); },
        async finish() { await refresh(); assertCurrent(); },
        close() { leases.delete(lease); lease.controller.abort(); },
      };
    },
  };
}
