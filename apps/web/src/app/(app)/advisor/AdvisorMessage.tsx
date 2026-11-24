"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, Globe, ShieldCheck, Sparkles } from "lucide-react";
import { isAppHref, type AdvisorAttachment, type AdvisorMessage as Message } from "@finvantage/contracts";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { ChangeDraftCard } from "./ChangeDraftCard";
import { DataCard } from "./DataCard";
import { GoalDraftCard } from "./GoalDraftCard";
import { LifeEventDraftCard } from "./LifeEventDraftCard";
import { AdvisorVisual } from "./visuals/AdvisorVisual";
import { MathDrawer } from "./MathDrawer";
import { splitFigures } from "@/lib/figureLinks";
import { longDate } from "@/lib/format";

type Calculation = Extract<AdvisorAttachment, { kind: "calculation" }>;
type WebSources = Extract<AdvisorAttachment, { kind: "web_sources" }>;

/** Every figure the Advisor worked out, with its working, so each number links to its inputs. */
function Workings({ items }: { items: Calculation[] }) {
  return (
    <details className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink">
        <Calculator size={15} className="text-accent-ink" aria-hidden /> How These Numbers Were Worked Out
      </summary>
      <ul className="mt-3 space-y-2">
        {items.map((c, i) => (
          <li key={i} className="rounded-xl bg-inset px-3 py-2">
            <p className="text-xs font-medium text-muted">{c.label}</p>
            <p className="font-mono text-xs text-ink">{c.expression} = <strong>{c.result}</strong></p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Sources({ items }: { items: WebSources[] }) {
  const sources = items.flatMap((item) => item.sources);
  if (sources.length === 0) return null;
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-ink">
        <Globe size={15} className="text-accent-ink" aria-hidden /> From the Web
      </p>
      <p className="mt-1 text-xs text-muted">Published terms change. Confirm them with the provider before you decide.</p>
      <ul className="mt-2 space-y-1">
        {sources.map((s) => (
          <li key={s.url} className="truncate">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-ink hover:underline">{s.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** **bold** spans inside a line. */
type Open = (figure: string, calc: Calculation, trigger: HTMLElement) => void;

/** A figure with a working behind it is a button that opens the drawer. */
function figures(text: string, calcs: Calculation[], open: Open): ReactNode {
  return splitFigures(text, calcs).map((seg, i) =>
    seg.calc
      ? (
        <button key={i} type="button" onClick={(e) => open(seg.text, seg.calc!, e.currentTarget)} title="Tap to see how this was worked out" className="tap-auto inline cursor-pointer border-b border-dotted border-accent-ink font-semibold text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
          {seg.text}
        </button>
      )
      : <Fragment key={i}>{seg.text}</Fragment>,
  );
}

function inline(text: string, calcs: Calculation[], open: Open): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-ink">{figures(part.slice(2, -2), calcs, open)}</strong>
      : <Fragment key={i}>{figures(part, calcs, open)}</Fragment>,
  );
}

/** Paragraphs and "- " bullet lists: all the formatting the Advisor is asked to use. */
function RichText({ text, calcs, asOf, sources }: { text: string; calcs: Calculation[]; asOf: string; sources: string[] }) {
  const [shown, setShown] = useState<{ figure: string; calc: Calculation } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: Open = (figure, calc, el) => { trigger.current = el; setShown({ figure, calc }); };
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {shown && <MathDrawer figure={shown.figure} calc={shown.calc} dataDate={asOf} sources={sources} returnTo={trigger.current} onClose={() => setShown(null)} />}
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (bullets) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-subtle">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""), calcs, open)}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, calcs, open)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export function AdvisorMessage({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-3 text-sm leading-6 text-white shadow-[0_4px_14px_-4px_rgba(84,74,247,0.45)] sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>
        <Sparkles size={15} />
      </span>
      <div className={`min-w-0 w-full space-y-3 ${message.attachments.some((a) => a.kind === "visual") ? "max-w-full sm:max-w-[56rem]" : "max-w-[95%] sm:max-w-[80%]"}`}>
        <div className="rounded-2xl rounded-tl-md bg-inset px-4 py-3 text-sm leading-6 text-ink">
          {message.source === "fallback" && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning-text">
              <ShieldCheck size={13} aria-hidden /> Safe Answer
            </p>
          )}
          <RichText text={message.content} calcs={message.attachments.filter((a): a is Calculation => a.kind === "calculation")} asOf={longDate(message.createdAt.slice(0, 10))} sources={message.citations.map((c) => c.label)} />
        </div>
        {message.attachments.map((attachment, i) =>
          attachment.kind === "life_event_draft"
            ? <LifeEventDraftCard key={i} id={`${message.id}:${i}`} draft={attachment.draft} goalChanges={attachment.goalChanges} />
            : attachment.kind === "visual"
              ? <AdvisorVisual key={i} id={`${message.id}:${i}`} visual={attachment.visual} />
              : attachment.kind === "goal_draft"
              ? <GoalDraftCard key={i} id={`${message.id}:${i}`} goal={attachment.goal} probabilityLow={attachment.probabilityLow} probabilityHigh={attachment.probabilityHigh} goalChanges={attachment.goalChanges} />
              : attachment.kind === "data_card"
                ? <DataCard key={i} card={attachment} />
                : attachment.kind === "change_draft"
                  ? <ChangeDraftCard key={i} id={`${message.id}:${i}`} draft={attachment} />
                  : attachment.kind === "navigate" && isAppHref(attachment.href)
                    ? (
                      <Link key={i} href={attachment.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-accent-ink transition hover:bg-inset">
                        Open {attachment.label} <ArrowRight size={15} aria-hidden />
                      </Link>
                    )
                    : null,
        )}
        {(() => {
          const calculations = message.attachments.filter((a): a is Calculation => a.kind === "calculation");
          const web = message.attachments.filter((a): a is WebSources => a.kind === "web_sources");
          return (
            <>
              {calculations.length > 0 && <Workings items={calculations} />}
              {web.length > 0 && <Sources items={web} />}
            </>
          );
        })()}
        {message.citations.some((c) => /mocked/i.test(c.label)) && <MockedBadge />}
        {message.citations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pl-1 text-xs text-muted">
            <span>Based on</span>
            {message.citations.map((c) => (
              <span key={c.tool} className="rounded-full border border-line bg-inset px-2 py-0.5 text-ink">{c.label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
