"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CategoryRule, SpendingCategory, Transaction } from "@finvantage/contracts";
import { CategoryManager, RecentTransactions, RulesPanel } from "./SpendingManager";

type Panel = "categories" | "rules" | null;

/** A panel over the page, closed with Escape, the close button, or a click outside it. */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="h-full w-full max-w-2xl overflow-y-auto p-5 shadow-2xl sm:p-6"
        style={{ background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-poppins text-xl font-bold" style={{ color: "var(--ink)" }}>{title}</h2>
          <button type="button" onClick={onClose} className="rounded-xl border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
            Close
          </button>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

/** The two buttons in the page header, and the panels they open. */
export function ManageTools({
  categories,
  rules,
  transactions,
}: {
  categories: SpendingCategory[];
  rules: CategoryRule[];
  transactions: Transaction[];
}) {
  const [open, setOpen] = useState<Panel>(null);
  const button = "rounded-xl border bg-white px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--accent)]";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen("categories")} className={button} style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
          Manage Categories
        </button>
        <button type="button" onClick={() => setOpen("rules")} className={button} style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
          Manage Automatic Rules
        </button>
      </div>
      {open === "categories" && (
        <Dialog title="Manage Categories" onClose={() => setOpen(null)}>
          <CategoryManager categories={categories} />
        </Dialog>
      )}
      {open === "rules" && (
        <Dialog title="Manage Automatic Rules" onClose={() => setOpen(null)}>
          <RulesPanel rules={rules} categories={categories} />
          <RecentTransactions transactions={transactions} categories={categories} />
        </Dialog>
      )}
    </>
  );
}
