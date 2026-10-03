import { useEffect, useState } from "react";

export default function OptimizationOperationFeedback({ operation }) {
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, performance.now() - operation.startedAt));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, performance.now() - operation.startedAt));
    }, 250);
    // Stop immediately on cancellation, including while the request unwinds.
    const stop = () => window.clearInterval(timer);
    operation.signal.addEventListener("abort", stop, { once: true });
    if (operation.signal.aborted) stop();
    return () => {
      stop();
      operation.signal.removeEventListener("abort", stop);
    };
  }, [operation]);

  const veryLong = elapsedMs >= 30_000;
  const long = elapsedMs >= 10_000;
  return (
    <>
      <span className="optimization-start-announcement" role="status">Optimizing network</span>
      {elapsedMs >= 500 ? (
        <div className="optimization-operation-feedback" aria-label="Network optimization activity" aria-live="off">
          <strong>{veryLong ? "Still optimizing" : long ? "Taking longer than usual" : "Optimizing network"}</strong>
          <span>{operation.scope.label}</span>
          <span className="optimization-elapsed">{(elapsedMs / 1000).toFixed(1)} s elapsed</span>
          {long ? <p>{veryLong ? "Complex geometry or search settings can require more time." : "Optimization is still running."}</p> : null}
        </div>
      ) : null}
    </>
  );
}
