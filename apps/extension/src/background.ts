import { ApiError, createApiClient } from "@finvantage/contracts";
import type { AccountReply, EvaluateReply, ExtensionMessage, SignInReply } from "./messages";

/*
 * Signed out, the Copilot answers for the shared demo profile. Signed in (popup), it answers for
 * the user's own account, including any bank they linked in the dashboard. Only the session token
 * is kept, in chrome.storage.local; the password is sent once to log in and never stored.
 */
const demoApi = createApiClient({ baseUrl: __API_URL__, token: __API_TOKEN__ });

interface Session {
  token: string;
  name: string;
}

async function getSession(): Promise<Session | null> {
  const stored = await chrome.storage.local.get("session");
  return (stored.session as Session | undefined) ?? null;
}

async function apiFor(session: Session | null) {
  return session ? createApiClient({ baseUrl: __API_URL__, token: session.token }) : demoApi;
}

/** Runs a call as the signed-in user. An expired session signs out and falls back to the demo. */
async function asUser<T>(call: (api: ReturnType<typeof createApiClient>) => Promise<T>): Promise<T> {
  const session = await getSession();
  try {
    return await call(await apiFor(session));
  } catch (error) {
    if (session && error instanceof ApiError && error.status === 401) {
      await chrome.storage.local.remove("session");
      return call(demoApi);
    }
    throw error;
  }
}

async function signIn(email: string, password: string): Promise<SignInReply> {
  try {
    const { token, user } = await demoApi.logIn({ body: { email, password } });
    await chrome.storage.local.set({ session: { token, name: user.displayName } satisfies Session });
    return { ok: true, name: user.displayName };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      return { ok: false, message: "Wrong email or password." };
    }
    return { ok: false, message: "Can't reach FinVantage. Is the app running?" };
  }
}

interface LocalState {
  enabled: boolean;
  snoozedSites: string[];
}

async function getLocalState(): Promise<LocalState> {
  const stored = await chrome.storage.local.get(["enabled", "snoozedSites"]);
  return {
    enabled: (stored.enabled as boolean | undefined) ?? true,
    snoozedSites: (stored.snoozedSites as string[] | undefined) ?? [],
  };
}

async function getDismissedSites(): Promise<string[]> {
  const stored = await chrome.storage.session.get("dismissedSites");
  return (stored.dismissedSites as string[] | undefined) ?? [];
}

async function evaluate(message: Extract<ExtensionMessage, { type: "evaluate" }>): Promise<EvaluateReply> {
  const [state, dismissed] = await Promise.all([getLocalState(), getDismissedSites()]);
  // Dismissed is per page; snoozed is per site. See content/index.ts.
  const blocked = state.snoozedSites.includes(message.site) || dismissed.includes(message.page);
  if (!state.enabled || blocked) return { kind: "silent" };

  try {
    const result = await asUser((api) => api.evaluateCopilot({ body: message.context }));
    return { kind: "result", result, webUrl: __WEB_URL__ };
  } catch (error) {
    console.warn("FinVantage: evaluate failed", error);
    return { kind: "silent" };
  }
}

async function recordAction(message: Extract<ExtensionMessage, { type: "action" }>) {
  if (message.action === "dismissed") {
    const dismissed = await getDismissedSites();
    await chrome.storage.session.set({ dismissedSites: [...dismissed, message.page] });
  }
  if (message.action === "snoozed") {
    const { snoozedSites } = await getLocalState();
    await chrome.storage.local.set({ snoozedSites: [...snoozedSites, message.site] });
  }
  await asUser((api) => api.recordCopilotAction({ params: { id: message.eventId }, body: { action: message.action } }))
    .catch((error: unknown) => console.warn("FinVantage: action not recorded", error));
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  switch (message.type) {
    case "evaluate":
      void evaluate(message).then(sendResponse);
      return true;
    case "action":
      void recordAction(message).then(() => sendResponse(null));
      return true;
    case "signIn":
      void signIn(message.email, message.password).then(sendResponse);
      return true;
    case "signOut":
      void chrome.storage.local.remove("session").then(() => sendResponse(null));
      return true;
    case "account":
      void getSession().then((session) => sendResponse({ name: session?.name ?? null } satisfies AccountReply));
      return true;
  }
});
