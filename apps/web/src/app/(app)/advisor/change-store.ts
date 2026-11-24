import type { ChangeRequest } from "@finvantage/contracts";
import { applyChange, changeErrorText, type ChangeApi } from "../../../lib/changes";
import type { DraftState } from "./draft-state";

/** How long a saved change can be undone. */
export const UNDO_WINDOW_MS = 30_000;

export type ChangePhase = DraftState | "undoing" | "undone";

export interface ChangeState {
  phase: ChangePhase;
  /** Words for the user when something failed or could not be done. */
  message: string;
  /** When it was saved, for the undo window. */
  savedAt: number | null;
  /** Present only in the session that saved it; a reload keeps "Saved" but not the undo. */
  undo: (() => Promise<void>) | null;
}

export interface ChangeStoreDeps {
  api: ChangeApi;
  /** Remembers the outcome in this browser so a reloaded card does not offer Confirm again. */
  persist: { get(id: string): DraftState | null; set(id: string, state: DraftState): void };
  now?: () => number;
}

/**
 * Where a change draft stands, shared by the card in the chat, the card on the call sheet and a
 * spoken yes. One place decides, so a change is never saved twice.
 */
export function createChangeStore({ api, persist, now = Date.now }: ChangeStoreDeps) {
  const states = new Map<string, ChangeState>();
  const listeners = new Set<() => void>();
  const appliedListeners = new Set<(request: ChangeRequest) => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (id: string, next: Partial<ChangeState>) => {
    states.set(id, { ...get(id), ...next });
    emit();
  };

  function get(id: string): ChangeState {
    let state = states.get(id);
    if (!state) {
      const prior = persist.get(id);
      state = { phase: prior === "saved" || prior === "dismissed" ? prior : "draft", message: "", savedAt: null, undo: null };
      states.set(id, state);
    }
    return state;
  }

  return {
    get,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Called after a change is saved, by tap or by voice, so the page can react (such as leaving a chat that was deleted). */
    onApplied(listener: (request: ChangeRequest) => void) {
      appliedListeners.add(listener);
      return () => void appliedListeners.delete(listener);
    },

    /** Saves the change. A second call while saving, or after it is saved, does nothing. */
    async confirm(id: string, request: ChangeRequest): Promise<ChangeState> {
      const current = get(id);
      if (current.phase !== "draft" && current.phase !== "error") return current;
      set(id, { phase: "saving", message: "" });
      try {
        const applied = await applyChange(api, request);
        persist.set(id, "saved");
        set(id, { phase: "saved", savedAt: now(), undo: applied.undo });
        for (const listener of appliedListeners) {
          try { listener(request); } catch { /* a listener must never undo a save */ }
        }
      } catch (err) {
        set(id, { phase: "error", message: changeErrorText(err) });
      }
      return get(id);
    },

    dismiss(id: string) {
      if (get(id).phase !== "draft" && get(id).phase !== "error") return;
      persist.set(id, "dismissed");
      set(id, { phase: "dismissed" });
    },

    /** Reverses a saved change, within the window. Returns whether it did. */
    async undo(id: string): Promise<boolean> {
      const current = get(id);
      if (current.phase !== "saved" || !current.undo || current.savedAt === null || now() - current.savedAt > UNDO_WINDOW_MS) return false;
      const undo = current.undo;
      set(id, { phase: "undoing", message: "" });
      try {
        await undo();
        persist.set(id, "dismissed");
        set(id, { phase: "undone", undo: null });
        return true;
      } catch (err) {
        set(id, { phase: "saved", message: changeErrorText(err) });
        return false;
      }
    },

    /** The most recent saved change that can still be undone, for a spoken "undo". */
    lastUndoable(): string | null {
      let found: { id: string; at: number } | null = null;
      for (const [id, s] of states) {
        if (s.phase === "saved" && s.undo && s.savedAt !== null && now() - s.savedAt <= UNDO_WINDOW_MS && (!found || s.savedAt >= found.at)) {
          found = { id, at: s.savedAt };
        }
      }
      return found?.id ?? null;
    },
  };
}
