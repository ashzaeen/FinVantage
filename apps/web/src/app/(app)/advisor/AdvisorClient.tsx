"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Menu, MessageSquarePlus, Sparkles, Trash2, X } from "lucide-react";
import type { AdvisorConversation, AdvisorMessage as Message, Situation } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { AdvisorMessage } from "./AdvisorMessage";

/** One general question, then one that opens each interactive visual. Amounts are stated so the tools can use them. */
const STARTERS = [
  "How do I increase my credit score?",
  "Can I afford a $28,000 car at 7.49% APR with $3,000 down?",
  "I want $1,500 saved for a spring trip by March. What do I need to do?",
  "If I put $500 in my Roth IRA in an S&P 500 fund instead of a PNC CD, what could it grow to in 10 years?",
  "Should I get the PNC Cash Unlimited Visa card?",
];

/** The first question sent when the Advisor is opened about something specific. */
function openingQuestion(situation: Situation): string {
  if (situation.kind === "copilot_event") return "What does this Copilot scan mean for my goals, and what are my options?";
  if (situation.kind === "simulation_change") return "What changed in this simulation, and what could I do about it?";
  return situation.question;
}

function setConversationInUrl(id: string | null) {
  const url = new URL(window.location.href);
  url.search = id ? `?c=${encodeURIComponent(id)}` : "";
  window.history.replaceState(null, "", url);
}

export function AdvisorClient({ initialConversationId, situation }: { initialConversationId: string | null; situation: Situation | null }) {
  const [conversations, setConversations] = useState<AdvisorConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showList, setShowList] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const scrollDown = () => requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

  const refreshList = useCallback(async () => {
    try {
      setConversations(await api.listAdvisorConversations());
    } catch {
      // The list is a convenience; the chat still works without it.
    }
  }, []);

  const open = useCallback(async (id: string) => {
    setError("");
    setShowList(false);
    try {
      const detail = await api.getAdvisorConversation({ params: { id } });
      setActiveId(detail.id);
      setMessages(detail.messages);
      setConversationInUrl(detail.id);
      scrollDown();
    } catch {
      setError("That conversation couldn't be loaded.");
    }
  }, []);

  const send = useCallback(async (text: string, conversationId: string | null, newSituation: Situation | null = null) => {
    const content = text.trim();
    if (!content) return;
    setLoading(true);
    setError("");
    const pending: Message = {
      id: "pending",
      conversationId: conversationId ?? "pending",
      role: "user",
      content,
      source: null,
      citations: [],
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, pending]);
    scrollDown();
    try {
      let id = conversationId;
      if (!id) {
        const created = await api.createAdvisorConversation({ body: { situation: newSituation } });
        id = created.id;
        setActiveId(id);
        setConversationInUrl(id);
      }
      const turn = await api.sendAdvisorMessage({ params: { id }, body: { content } });
      setMessages((m) => [...m.filter((x) => x.id !== "pending"), turn.userMessage, turn.reply]);
      scrollDown();
      void refreshList();
    } catch {
      setMessages((m) => m.filter((x) => x.id !== "pending"));
      setDraft(content);
      setError("I couldn't reach the Advisor. Please try sending your message again.");
    } finally {
      setLoading(false);
    }
  }, [refreshList]);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void refreshList();
    if (situation) void send(openingQuestion(situation), null, situation);
    else if (initialConversationId) void open(initialConversationId);
  }, [initialConversationId, situation, open, send, refreshList]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const text = draft;
    setDraft("");
    void send(text, activeId);
  }

  function startNew() {
    setActiveId(null);
    setMessages([]);
    setError("");
    setShowList(false);
    setConversationInUrl(null);
  }

  async function remove(id: string) {
    try {
      await api.deleteAdvisorConversation({ params: { id } });
      setConversations((list) => list.filter((c) => c.id !== id));
      if (id === activeId) startNew();
    } catch {
      setError("That conversation couldn't be deleted.");
    }
  }

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line p-3">
        <h3 className="text-sm font-semibold text-ink">View History</h3>
        <button type="button" onClick={() => setShowList(false)} className="rounded-lg p-2 text-muted hover:bg-inset" aria-label="Close Conversations">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <nav aria-label="Conversations" className="space-y-0.5 rounded-xl border border-line p-2">
          {conversations.length === 0 && <p className="px-2 py-3 text-xs text-muted">Your conversations are saved here.</p>}
          {conversations.map((c) => (
            <div key={c.id} className={`group flex items-center rounded-lg ${c.id === activeId ? "bg-accent-soft" : "hover:bg-inset"}`}>
              <button type="button" onClick={() => open(c.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-ink">
                {c.title}
              </button>
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="mr-1 rounded-md p-1.5 text-subtle opacity-100 hover:text-critical md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <button
          type="button"
          onClick={startNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <MessageSquarePlus size={16} aria-hidden /> New Chat
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full bg-card">
      {showList && (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-black/30" onClick={() => setShowList(false)} aria-label="Close Conversations" />
          <aside className="absolute inset-y-0 right-0 w-72 max-w-[85%] border-l border-line bg-surface shadow-xl">{list}</aside>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-4 sm:px-7">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white">
            <Sparkles size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-poppins text-lg font-bold text-ink">Ask Your AI Advisor</h2>
            <p className="truncate text-sm text-muted">Sees your accounts, spending, goals, life events, reports, and Copilot scans</p>
          </div>
          <button type="button" onClick={() => setShowList(true)} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-inset hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Show Conversation History">
            <span>View History</span>
            <Menu size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto bg-surface px-4 py-6 sm:px-7">
          {messages.length === 0 && !loading && (
            <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center py-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Sparkles size={24} aria-hidden />
              </div>
              <h3 className="font-poppins text-xl font-bold text-ink">What Would You Like to Figure Out?</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Ask about anything in FinVantage: a budget, a transaction, a goal, a report, or a purchase you&apos;re weighing. Every figure comes from your data.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {STARTERS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="rounded-full border border-line bg-card px-3 py-2 text-xs text-ink transition hover:border-accent hover:text-accent"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => <AdvisorMessage key={message.id} message={message} />)}
          {loading && (
            <div className="flex">
              <div className="rounded-3xl rounded-bl-md border border-line bg-card px-4 py-3 text-sm text-muted">
                <span className="animate-pulse">Looking through your finances…</span>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-center text-sm text-critical">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={submit} className="flex shrink-0 items-end gap-3 border-t border-line bg-card p-4 sm:px-7 sm:py-5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Message your Advisor…"
            aria-label="Message your Advisor"
            className="max-h-32 min-h-12 flex-1 resize-y rounded-2xl border border-line bg-inset px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-card"
          />
          <button
            type="submit"
            disabled={!draft.trim() || loading}
            className="h-12 shrink-0 rounded-2xl bg-accent px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "…" : "Send"}
          </button>
        </form>
        <p className="shrink-0 bg-card px-5 pb-3 text-center text-xs text-subtle">
          Educational guidance, not financial advice. The Advisor suggests options and never moves money or changes your data without you.
        </p>
      </section>
    </div>
  );
}
