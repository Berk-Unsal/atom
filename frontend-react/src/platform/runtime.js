const ACTIVE_STATES = new Set(["starting", "loading-dataset", "ready"]);

function runtimeError() {
  const error = new Error("The planning service changed or stopped. Your workspace is preserved. Use Help → Restart planning service if needed, then run the action again.");
  error.code = "runtime_changed";
  return error;
}

/** Runtime leases never retry work. They cover body consumption, not just headers. */
export function createRuntimeGuard(bridge) {
  let status = null;
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
    if (!subscribed) {
      if (typeof bridge.getRuntime !== "function" || typeof bridge.onRuntimeChange !== "function") throw runtimeError();
      bridge.onRuntimeChange(apply); subscribed = true;
    }
    let timer;
    try {
      const next = await Promise.race([bridge.getRuntime(), new Promise((_, reject) => { timer = setTimeout(() => reject(runtimeError()), 30_000); })]);
      apply(next);
      return next;
    } finally { clearTimeout(timer); }
  };
  const captureBinding = () => {
    const binding = { generation: null, ready: false };
    // Capture the reply itself even if a newer event has already arrived. An
    // old action cannot be moved to a newer generation by a delayed reply.
    binding.pending = refresh().then((next) => {
      binding.generation = next.generation;
      binding.ready = ACTIVE_STATES.has(next.state) && /^[a-f0-9]{32}$/.test(next.generation || "");
    }).catch((error) => { binding.error = error; });
    return binding;
  };
  return {
    bindOperation(signal) { if (signal && !operations.has(signal)) operations.set(signal, captureBinding()); },
    captureOperation() {
      const binding = captureBinding();
      return () => binding.ready && status?.generation === binding.generation && ACTIVE_STATES.has(status.state);
    },
    async begin(signal) {
      const existing = signal && operations.get(signal);
      const binding = existing || captureBinding();
      if (signal && !existing) operations.set(signal, binding);
      await binding.pending;
      if (binding.error) throw binding.error;
      if (existing) await refresh();
      if (!binding.ready || binding.generation !== status?.generation || !ACTIVE_STATES.has(status?.state)) throw runtimeError();
      const lease = { generation: status.generation, controller: new AbortController(), invalidated: false };
      leases.add(lease);
      const assertCurrent = () => { if (lease.invalidated || status.generation !== lease.generation || !ACTIVE_STATES.has(status.state)) throw runtimeError(); };
      return {
        generation: lease.generation,
        signal: signal ? AbortSignal.any([signal, lease.controller.signal]) : lease.controller.signal,
        assertCurrent,
        validateResponse(response) { if (response.headers.get("X-Atom-Runtime-Generation") !== lease.generation) throw runtimeError(); assertCurrent(); },
        async finish() { await refresh(); assertCurrent(); },
        cancel() { lease.controller.abort(); },
        close() { leases.delete(lease); },
      };
    },
  };
}
