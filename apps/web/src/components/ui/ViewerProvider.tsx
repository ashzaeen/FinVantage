"use client";

import { createContext, useContext, type ReactNode } from "react";

const ViewerContext = createContext({ isDemo: false });

/** Tells client components whether this is the demo profile. Set once, on the server, in the dashboard layout. */
export function ViewerProvider({ isDemo, children }: { isDemo: boolean; children: ReactNode }) {
  return <ViewerContext.Provider value={{ isDemo }}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  return useContext(ViewerContext);
}
