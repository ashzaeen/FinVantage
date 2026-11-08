"use client";

import { useEffect, useRef } from "react";
import { LIVE_STREAM_PATH, LiveEvent } from "@finvantage/contracts";
import { API_URL, currentToken } from "./api";

/** Subscribes to pushed updates. Works the same whichever transport the API uses. */
export function useLiveEvents(onEvent: (event: LiveEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;
    const listener = (message: MessageEvent<string>) => {
      const parsed = LiveEvent.safeParse(JSON.parse(message.data));
      if (parsed.success) handler.current(parsed.data);
    };
    void currentToken().then((token) => {
      if (closed) return;
      source = new EventSource(`${API_URL}${LIVE_STREAM_PATH}?token=${encodeURIComponent(token)}`);
      const types = LiveEvent.options.map((option) => option.shape.type.value);
      types.forEach((type) => source?.addEventListener(type, listener));
    });
    return () => {
      closed = true;
      source?.close();
    };
  }, []);
}
