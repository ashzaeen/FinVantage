"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { createChangeStore, UNDO_WINDOW_MS, type ChangeState } from "./change-store";
import { draftPersistence } from "./draft-state";

/** The one place change drafts are confirmed, dismissed and undone, in this browser tab. */
export const changes = createChangeStore({ api, persist: draftPersistence });

const SERVER_STATE: ChangeState = { phase: "draft", message: "", savedAt: null, undo: null };

/** A draft's state, kept in step with a tap on its card or a spoken yes. */
export function useChangeState(id: string): ChangeState {
  return useSyncExternalStore(changes.subscribe, () => changes.get(id), () => SERVER_STATE);
}

/** True while a saved change can still be undone. Re-renders when the window closes. */
export function useCanUndo(state: ChangeState): boolean {
  const [, tick] = useState(0);
  const open = state.phase === "saved" && !!state.undo && state.savedAt !== null;
  useEffect(() => {
    if (!open || state.savedAt === null) return;
    const left = state.savedAt + UNDO_WINDOW_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => tick((n) => n + 1), left + 50);
    return () => clearTimeout(timer);
  }, [open, state.savedAt]);
  return open && state.savedAt !== null && Date.now() - state.savedAt <= UNDO_WINDOW_MS;
}
