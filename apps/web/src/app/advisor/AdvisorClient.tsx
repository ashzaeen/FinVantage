"use client";

import { useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };

export function AdvisorClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const question = draft.trim();
    if (!question || loading) return;
    const next: Message[] = [...messages, { role: "user" as const, content: question }].slice(-12);
    setMessages(next);
    setDraft("");
    setLoading(true);
    setError("");
    try {
      const response = await api.advisorChat({ body: { messages: next } });
      setMessages([...next, { role: "assistant" as const, content: response.answer }].slice(-12));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    } catch {
      setError("I couldn't reach the advisor. Please try sending your message again.");
    } finally {
      setLoading(false);
    }
  }

  return <Card className="!flex !h-full !min-h-0 !w-full !flex-col !rounded-none !border-0 !p-0 !shadow-none overflow-hidden">
    <div className="shrink-0 border-b border-[#edf0f7] px-5 py-4 sm:px-7">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#544af7] text-xl text-white">✦</div>
        <div><h2 className="font-poppins text-lg font-bold text-[#16192c]">Ask your AI Advisor</h2><p className="text-sm text-[#8d94a8]">Grounded in your goals and financial activity</p></div>
      </div>
    </div>
    <div className="flex-1 space-y-5 overflow-y-auto bg-[#fbfbfe] px-4 py-6 sm:px-7">
      {messages.length === 0 && <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center py-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef1fc] text-2xl text-[#544af7]">✦</div><h3 className="font-poppins text-xl font-bold text-[#16192c]">What would you like to figure out?</h3><p className="mt-2 text-sm leading-6 text-[#8d94a8]">Ask about your budget, goals, credit, or a financial decision. I’ll use your saved FinVantage data when it’s relevant.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{["How am I tracking toward my goals?", "What should I consider before a big purchase?", "Help me understand my recent spending"].map((prompt) => <button key={prompt} onClick={() => setDraft(prompt)} className="rounded-full border border-[#e7e9f2] bg-white px-3 py-2 text-xs text-[#4a4f68] hover:border-[#544af7] hover:text-[#544af7]">{prompt}</button>)}</div></div>}
      {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 sm:max-w-[80%] ${message.role === "user" ? "rounded-br-md bg-[#544af7] text-white" : "rounded-bl-md border border-[#edf0f7] bg-white text-[#30344a] shadow-sm"}`}>{message.content}</div></div>)}
      {loading && <div className="flex"><div className="rounded-3xl rounded-bl-md border border-[#edf0f7] bg-white px-4 py-3 text-sm text-[#8d94a8]">Thinking…</div></div>}
      {error && <p role="alert" className="text-center text-sm text-[#d7465d]">{error}</p>}
      <div ref={bottomRef} />
    </div>
    <form onSubmit={ask} className="shrink-0 flex items-end gap-3 border-t border-[#edf0f7] bg-white p-4 sm:px-7 sm:py-5">
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={4000} placeholder="Message your advisor…" aria-label="Message your advisor" className="max-h-32 min-h-12 flex-1 resize-y rounded-2xl border border-[#edf0f7] bg-[#f8f9fe] px-4 py-3 text-sm text-[#16192c] outline-none transition focus:border-[#544af7] focus:bg-white" />
      <button type="submit" disabled={!draft.trim() || loading} className="h-12 shrink-0 rounded-2xl bg-[#544af7] px-5 text-sm font-semibold text-white transition hover:bg-[#453bc9] disabled:cursor-not-allowed disabled:opacity-40">{loading ? "…" : "Send"}</button>
    </form>
    <p className="shrink-0 px-5 pb-3 text-center text-xs text-[#a0a5b5]">AI can make mistakes. Review important financial decisions carefully.</p>
  </Card>;
}
