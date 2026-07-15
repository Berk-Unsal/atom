import { useCallback, useEffect, useMemo, useRef } from "react";

export default function useRequestCoordinator() {
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
  }, [cancel]);

  useEffect(() => () => {
    channelsRef.current.forEach(({ controller }) => controller.abort());
    channelsRef.current.clear();
  }, []);

  return useMemo(() => ({ begin, cancel }), [begin, cancel]);
}
