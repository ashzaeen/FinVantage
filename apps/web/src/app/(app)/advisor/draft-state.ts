/** Whether the user saved or dismissed an Advisor draft card, remembered in this browser. */
export type DraftState = "draft" | "saving" | "saved" | "dismissed" | "error";

/** Safe to call from the server or a browser with storage blocked. */
export const draftPersistence = {
  get: (id: string): DraftState | null => {
    try {
      return remembered(id);
    } catch {
      return null;
    }
  },
  set: (id: string, state: DraftState) => remember(id, state),
};

const STORAGE_KEY = "finvantage.advisor.drafts";

function read(): Record<string, DraftState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, DraftState>;
  } catch {
    return {};
  }
}

export function remembered(id: string): DraftState | null {
  return read()[id] ?? null;
}

export function remember(id: string, state: DraftState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), [id]: state }));
  } catch {
    // Storage blocked: the card just forgets after a reload.
  }
}
