"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isAppHref, type AdvisorMessage } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { sendErrorText } from "@/lib/advisor-errors";
import { useSpokenReplies } from "@/lib/useSpokenReplies";
import { useVoiceCall, type CallTurn } from "@/lib/useVoiceCall";
import { draftsOf, spokenIntent } from "@/lib/voice-intents";
import { spokenNavigation } from "@/lib/voice-navigation";
import { changes } from "./change-drafts";
import { VoiceCall } from "./VoiceCall";

/** What the Advisor page is told about a call, so its chat can show what was said. */
export type CallEvent = { type: "turn" | "ended"; conversationId: string | null };

interface AdvisorCall {
  /** A call is open, as the sheet or the pill. */
  active: boolean;
  /** Starts a call. Call it inside the click that asks for it, so the browser lets the voice play. */
  start: (options?: { conversationId?: string | null }) => void;
  /** Hears each saved turn and the end of the call. Returns how to stop listening. */
  subscribe: (listener: (event: CallEvent) => void) => () => void;
}

const NONE: AdvisorCall = { active: false, start: () => {}, subscribe: () => () => {} };
const CallContext = createContext<AdvisorCall>(NONE);

export const useAdvisorCall = () => useContext(CallContext);

/**
 * Owns the voice call for the whole app. It lives in the layout, above every page, so opening
 * another page (by voice or by hand) does not end the call: the sheet shrinks to a pill instead.
 */
export function AdvisorCallProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<{ conversationId: string | null } | null>(null);
  const listeners = useRef(new Set<(event: CallEvent) => void>());
  const emit = useCallback((event: CallEvent) => listeners.current.forEach((l) => l(event)), []);
  // One voice for the whole call. It lives here, not in the call, so `start` can unlock the
  // browser's audio inside the click that begins it.
  const { prime, speak, stop } = useSpokenReplies();

  const start = useCallback((options?: { conversationId?: string | null }) => {
    stop();
    prime();
    setSeed({ conversationId: options?.conversationId ?? null });
  }, [prime, stop]);

  const subscribe = useCallback((listener: (event: CallEvent) => void) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

  const value = useMemo<AdvisorCall>(() => ({ active: seed !== null, start, subscribe }), [seed, start, subscribe]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {seed && <ActiveCall seedConversationId={seed.conversationId} speak={speak} stop={stop} emit={emit} onClosed={() => setSeed(null)} />}
    </CallContext.Provider>
  );
}

/** One call, from start to end. It is mounted only while a call is open, so leaving the call stops everything in it. */
function ActiveCall({
  seedConversationId,
  speak,
  stop,
  emit,
  onClosed,
}: {
  seedConversationId: string | null;
  speak: (conversationId: string, message: AdvisorMessage, options?: { local?: boolean }) => Promise<void>;
  stop: () => void;
  emit: (event: CallEvent) => void;
  onClosed: () => void;
}) {
  const router = useRouter();
  const [minimized, setMinimized] = useState(false);
  const conversationRef = useRef<string | null>(seedConversationId);
  /** The Advisor's latest reply in this call, which a spoken yes, no or undo is about. */
  const lastReply = useRef<AdvisorMessage | null>(null);
  const localCount = useRef(0);

  /** Opens a page and shrinks the sheet to the pill, so the page can be seen while the call goes on. */
  const go = useCallback((href: string) => {
    setMinimized(true);
    router.push(href);
  }, [router]);

  /** Words from the app itself, not a saved Advisor reply. With `base`, on that reply, so its cards stay. */
  const say = useCallback((content: string, base?: AdvisorMessage | null): CallTurn => {
    const conversationId = conversationRef.current ?? "local";
    const reply: AdvisorMessage = base
      ? { ...base, content }
      : { id: `local-${++localCount.current}`, conversationId, role: "assistant", content, source: null, citations: [], attachments: [], createdAt: new Date().toISOString() };
    return { conversationId, reply, local: true };
  }, []);

  // A short spoken yes, no or undo is dealt with here, through the same state as the card, and is
  // not sent to the Advisor. Anything longer goes to it as usual.
  const answerByVoice = useCallback(async (said: string): Promise<CallTurn | null> => {
    const intent = spokenIntent(said);
    if (!intent) return null;
    const last = lastReply.current;
    if (intent === "undo") {
      const id = changes.lastUndoable();
      if (!id) return say("There's nothing to undo right now.", last);
      return say((await changes.undo(id)) ? "Undone." : "I couldn't undo that. You can fix it on the page.", last);
    }
    if (!last) return null;
    const waiting = draftsOf(last).filter((d) => ["draft", "error"].includes(changes.get(d.id).phase)).at(-1);
    if (!waiting) return null;
    if (intent === "no") {
      changes.dismiss(waiting.id);
      return say("Okay, I won't save it.", last);
    }
    if (waiting.destructive) return say(`That one needs a tap. Press ${waiting.confirmLabel} on screen, or say no.`, last);
    const result = await changes.confirm(waiting.id, waiting.request);
    return say(result.phase === "saved" ? "Saved. Say undo if that's not right." : result.message || "That couldn't be saved.", last);
  }, [say]);

  const sendTurn = useCallback(async (text: string): Promise<CallTurn | { error: string }> => {
    // A clear "open Goals" needs no Advisor, so it is instant.
    const navigation = spokenNavigation(text);
    if (navigation) {
      go(navigation.href);
      return say(navigation.said);
    }
    const local = await answerByVoice(text);
    if (local) return local;
    try {
      let id = conversationRef.current;
      if (!id) {
        id = (await api.createAdvisorConversation({ body: {} })).id;
        conversationRef.current = id;
      }
      const turn = await api.sendAdvisorMessage({ params: { id }, body: { content: text.trim(), modality: "voice" } });
      lastReply.current = turn.reply;
      emit({ type: "turn", conversationId: id });
      // The Advisor chose a page: only ever one of the app's own.
      const link = turn.reply.attachments.find((a) => a.kind === "navigate" && isAppHref(a.href));
      if (link && link.kind === "navigate") go(link.href);
      // A change is waiting for a yes or a tap, so bring the sheet back to show it.
      else if (turn.reply.attachments.some((a) => a.kind === "change_draft")) setMinimized(false);
      return { conversationId: id, reply: turn.reply };
    } catch (err) {
      return { error: sendErrorText(err) };
    }
  }, [answerByVoice, emit, go, say]);

  const speakTurn = useCallback((turn: CallTurn) => speak(turn.conversationId, turn.reply, { local: turn.local }), [speak]);

  const call = useVoiceCall({
    sendTurn,
    speakTurn,
    stopSpeaking: stop,
    onClose: () => {
      emit({ type: "ended", conversationId: conversationRef.current });
      onClosed();
    },
  });

  return <VoiceCall call={call} minimized={minimized} onMinimize={() => setMinimized(true)} onExpand={() => setMinimized(false)} />;
}
