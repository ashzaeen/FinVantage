"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  Car,
  CreditCard,
  Gauge,
  LineChart,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeft,
  Plane,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AdvisorConversation, AdvisorMessage as Message, Situation } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { AdvisorMessage } from "./AdvisorMessage";

/**
 * One general question, then one that opens each interactive visual. Amounts are stated so the
 * tools can use them. Tints match the icon tiles on the other tabs.
 */
const STARTERS: Array<{ label: string; question: string; icon: LucideIcon; tint: { bg: string; fg: string } }> = [
  { label: "Credit", question: "How do I increase my credit score?", icon: Gauge, tint: { bg: "var(--good-bg)", fg: "var(--good)" } },
  { label: "Car Loan", question: "Can I afford a $28,000 car at 7.49% APR with $3,000 down?", icon: Car, tint: { bg: "var(--accent-soft)", fg: "var(--accent)" } },
  { label: "Trip Plan", question: "I want $1,500 saved for a spring trip by March. What do I need to do?", icon: Plane, tint: { bg: "var(--info-bg)", fg: "var(--info)" } },
  { label: "Investing", question: "If I put $500 in my Roth IRA in an S&P 500 fund instead of a PNC CD, what could it grow to in 10 years?", icon: LineChart, tint: { bg: "var(--warning-bg)", fg: "var(--warning)" } },
  { label: "Card Check", question: "Should I get the PNC Cash Unlimited Visa card?", icon: CreditCard, tint: { bg: "var(--critical-bg)", fg: "var(--critical)" } },
];

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** "Today, 3:42 PM", "Yesterday", or "Nov 6". */
function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return `Today, ${TIME.format(d)}`;
  if (days === 1) return "Yesterday";
  return DAY.format(d);
}

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
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="font-poppins text-base font-bold text-ink">Conversations</h2>
          <p className="mt-0.5 text-xs text-muted">Saved as you go</p>
        </div>
        <button type="button" onClick={() => setShowList(false)} className="rounded-lg p-2 text-muted hover:bg-inset md:hidden" aria-label="Close Conversations">
          <X size={18} />
        </button>
      </div>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={startNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
        >
          <MessageSquarePlus size={16} aria-hidden /> New Chat
        </button>
      </div>
      <nav aria-label="Conversations" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {conversations.length === 0 && (
          <div className="mx-2 mt-2 rounded-2xl border border-dashed border-line px-4 py-6 text-center">
            <MessagesSquare size={20} className="mx-auto text-subtle" aria-hidden />
            <p className="mt-2 text-xs text-muted">Your conversations will appear here.</p>
          </div>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <div key={c.id} className={`group flex items-center rounded-xl transition-colors ${active ? "bg-accent-soft" : "hover:bg-inset"}`}>
              <button type="button" onClick={() => open(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                <span className={`block truncate text-sm ${active ? "font-semibold text-accent" : "text-ink"}`}>{c.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{when(c.updatedAt)}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="mr-1.5 rounded-lg p-1.5 text-subtle opacity-100 hover:bg-critical-bg hover:text-critical md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );

  const panel = "rounded-3xl border border-line bg-card shadow-[0_2px_12px_0_rgba(22,25,44,0.03)]";

  return (
    <div className="flex h-full min-h-0 flex-col">

      <div className="flex min-h-0 flex-1 gap-3">
        {/* 16px of frame plus 20px here: the title sits 36px down, like PageHeader on other tabs. */}
        <div className="hidden w-60 shrink-0 flex-col md:flex md:pt-5 lg:w-64">
          {/* Same title style and spacing as PageHeader on every other tab. */}
          <h1 className="mb-8 font-poppins text-3xl font-bold tracking-tight text-[#16192c]">Advisor</h1>
          <aside className={`min-h-0 flex-1 overflow-hidden ${panel}`}>{list}</aside>
        </div>
        {showList && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/30" onClick={() => setShowList(false)} aria-label="Close Conversations" />
            <aside className="absolute inset-y-0 left-0 w-80 max-w-[85%] bg-card shadow-xl">{list}</aside>
          </div>
        )}

        <section className={`flex min-w-0 flex-1 flex-col overflow-hidden ${panel}`}>
          {/* Phones only: the Conversations card is hidden there, so its controls sit here. */}
          <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2 md:hidden">
            <h1 className="mr-auto font-poppins text-lg font-bold text-ink">Advisor</h1>
            <button type="button" onClick={() => setShowList(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-inset">
              <PanelLeft size={15} aria-hidden /> Chats
            </button>
            <button type="button" onClick={startNew} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
              <MessageSquarePlus size={15} aria-hidden /> New Chat
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5 sm:px-5">
            {messages.length === 0 && !loading && (
              <div className="mx-auto my-auto w-full max-w-2xl">
                <div className="text-center">
                  <h3 className="font-poppins text-2xl font-bold tracking-tight text-ink">What Would You Like to Figure Out?</h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
                    Ask about anything in FinVantage: a budget, a goal, a report, or a purchase you&apos;re weighing. Every figure comes from your data.
                  </p>
                </div>
                <div className="page-cascade mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {STARTERS.map(({ label, question, icon: Icon, tint }, i) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => setDraft(question)}
                      className={`card-lift flex items-start gap-3 rounded-2xl border border-line bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${i === STARTERS.length - 1 && STARTERS.length % 2 === 1 ? "sm:col-span-2" : ""}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tint.bg, color: tint.fg }}>
                        <Icon size={18} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-muted">{label}</span>
                        <span className="mt-0.5 block text-sm leading-5 text-ink">{question}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => <AdvisorMessage key={message.id} message={message} />)}
            {loading && (
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Sparkles size={15} aria-hidden />
                </span>
                <div className="rounded-2xl rounded-tl-md bg-inset px-4 py-3 text-sm text-muted">
                  <span className="inline-flex items-center gap-2">
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                    </span>
                    Looking through your finances…
                  </span>
                </div>
              </div>
            )}
            {error && <p role="alert" className="text-center text-sm text-critical">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-line px-3 pb-2.5 pt-3 sm:px-5">
            <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-line bg-inset p-2 transition focus-within:border-accent focus-within:bg-card focus-within:shadow-[0_0_0_4px_rgba(84,74,247,0.08)]">
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
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-subtle"
              />
              <button
                type="submit"
                disabled={!draft.trim() || loading}
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={18} aria-hidden />
              </button>
            </form>
            <p className="mt-2 text-center text-[11px] text-subtle">
              Educational guidance, not financial advice. The Advisor suggests options and never moves money or changes your data without you.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
