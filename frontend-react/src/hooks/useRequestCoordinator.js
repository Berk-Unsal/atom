import { useCallback, useEffect, useMemo, useRef } from "react";
import { platform } from "../platform/index.js";

export default function useRequestCoordinator(runtime = platform) {
  const channelsRef = useRef(new Map());
  const sequenceRef = useRef(0);

  const cancel = useCallback((channel) => {
    const active = channelsRef.current.get(channel);
    active?.controller.abort();
    channelsRef.current.delete(channel);
  }, []);

  const begin = useCallback((channel) => {
    cancel(channel);
    const controller = new AbortController();
    // Bind before any Run-history await, so an interrupted user action cannot
    // silently start its first/next HTTP request on a replacement backend.
    runtime.bindOperation(controller.signal);
    const request = {
      channel,
      controller,
      id: sequenceRef.current + 1,
    };
    sequenceRef.current = request.id;
    channelsRef.current.set(channel, request);

    return {
      signal: controller.signal,
      isCurrent: () => channelsRef.current.get(channel)?.id === request.id && !controller.signal.aborted,
      finish: () => {
        if (channelsRef.current.get(channel)?.id === request.id) {
          channelsRef.current.delete(channel);
        }
      },
    };
  }, [cancel, runtime]);

  useEffect(() => () => {
    channelsRef.current.forEach(({ controller }) => controller.abort());
    channelsRef.current.clear();
  }, []);

  return useMemo(() => ({ begin, cancel }), [begin, cancel]);
}
