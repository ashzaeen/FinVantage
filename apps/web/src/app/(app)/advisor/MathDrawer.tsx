"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Shows the working behind one figure in an answer: what it is, the inputs and formula, and the
 * result. A side drawer from 640px, a bottom sheet below. Escape and the Close button shut it and
 * focus goes back to the figure that opened it. Focus stays inside while it is open.
 */
export function MathDrawer({ figure, calc, dataDate, sources, onClose, returnTo }: {
  figure: string;
  calc: { label: string; expression: string; result: string };
  /** Display text for when the answer's figures were worked out. */
  dataDate: string;
  sources: string[];
  onClose: () => void;
  returnTo: HTMLElement | null;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      returnTo?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-[120] flex items-end justify-end bg-ink/40 backdrop-blur-[2px] sm:items-stretch">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="math-title" className="w-full max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-raised p-5 shadow-2xl sm:max-h-none sm:max-w-sm sm:rounded-none sm:rounded-l-3xl sm:p-6" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">How This Was Worked Out</p>
            <h2 id="math-title" className="mt-1 font-poppins text-3xl font-bold tabular-nums text-ink">{figure}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-inset"><X size={18} aria-hidden /></button>
        </div>
        <dl className="mt-4 space-y-4 text-sm">
          <div><dt className="text-xs font-semibold text-muted">What It Is</dt><dd className="mt-1 text-ink">{calc.label}</dd></div>
          <div><dt className="text-xs font-semibold text-muted">The Working, With Its Inputs</dt><dd className="mt-1 break-words rounded-xl bg-inset px-3 py-2 font-mono text-xs text-ink">{calc.expression} = <strong>{calc.result}</strong></dd></div>
          <div><dt className="text-xs font-semibold text-muted">Figures As Of</dt><dd className="mt-1 text-ink">{dataDate}</dd></div>
          {sources.length > 0 && <div><dt className="text-xs font-semibold text-muted">Based On</dt><dd className="mt-1 flex flex-wrap gap-1.5">{sources.map((s) => <span key={s} className="rounded-full border border-line bg-inset px-2 py-0.5 text-xs text-ink">{s}</span>)}</dd></div>}
        </dl>
        <p className="mt-4 text-xs text-muted">Every number is worked out by the app before the Advisor words it. The Advisor does not change it.</p>
      </div>
    </div>
  );
}
