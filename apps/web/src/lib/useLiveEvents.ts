"use client";

import { useEffect, useRef } from "react";
import { LIVE_STREAM_PATH, LiveEvent } from "@finvantage/contracts";
import { API_URL, currentToken } from "./api";
import { readCookie, TOKEN_COOKIE, usableToken } from "./token";

/** wss://maincloud.spacetimedb.com in production. Unset means SSE only. */
const SPACETIME_URL = process.env.NEXT_PUBLIC_SPACETIME_URL ?? "";
const SPACETIME_MODULE = process.env.NEXT_PUBLIC_SPACETIME_MODULE ?? "finvantage";

/**
 * Subscribes to pushed updates. Works the same whichever transport the API uses.
 *
 * Signed in, with NEXT_PUBLIC_SPACETIME_URL set: a SpacetimeDB subscription to `my_live_event`,
 * using the FinVantage sign-in token as the Spacetime identity. The module only shows a user their
 * own rows, and a push arrives whichever server instance sent it. Otherwise (signed out, local
 * dev, or if Spacetime can't be reached): the API's SSE stream.
 *
 * Events are only a signal to refetch through `api`. Figures always come from the API.
 */
export function useLiveEvents(onEvent: (event: LiveEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    let closed = false;
    let stop = () => {};

    const deliver = (raw: string) => {
      try {
        const parsed = LiveEvent.safeParse(JSON.parse(raw));
        if (parsed.success) handler.current(parsed.data);
      } catch {
        // Not JSON: ignore it.
      }
    };

    const startSse = () => {
      void currentToken().then((token) => {
        if (closed) return;
        const source = new EventSource(`${API_URL}${LIVE_STREAM_PATH}?token=${encodeURIComponent(token)}`);
        const listener = (message: MessageEvent<string>) => deliver(message.data);
        LiveEvent.options.map((option) => option.shape.type.value).forEach((type) => source.addEventListener(type, listener));
        stop = () => source.close();
      });
    };

    const token = usableToken(readCookie(document.cookie, TOKEN_COOKIE));
    if (!SPACETIME_URL || !token) {
      startSse();
    } else {
      // Loaded on demand so signed-out visitors never download the SDK.
      void import("@/spacetime")
        .then(({ DbConnection }) => {
          if (closed) return;
          // Rows already in the table when the subscription starts are old news. Only new ones count.
          let applied = false;
          const conn = DbConnection.builder()
            .withUri(SPACETIME_URL)
            .withDatabaseName(SPACETIME_MODULE)
            .withToken(token)
            .onConnect((connection) => {
              connection
                .subscriptionBuilder()
                .onApplied(() => {
                  applied = true;
                })
                .subscribe("SELECT * FROM my_live_event");
            })
            .onConnectError(() => {
              if (!closed) startSse();
            })
            .build();
          conn.db.myLiveEvent.onInsert((_ctx, row) => {
            if (applied) deliver(row.payload);
          });
          stop = () => conn.disconnect();
        })
        .catch(() => {
          if (!closed) startSse();
        });
    }

    return () => {
      closed = true;
      stop();
    };
  }, []);
}
