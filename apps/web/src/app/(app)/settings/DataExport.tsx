"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { accountsCsv, goalsCsv, transactionsCsv } from "@/lib/dataExport";
import { buttonClass } from "@/components/ui/Button";

function save(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Download what the app holds about the user. Runs in the browser from the same API every page uses. */
export function DataExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(kind: "json" | "csv") {
    setBusy(true);
    setMessage("");
    try {
      const [user, accounts, transactions, goals, lifeEvents, budgets] = await Promise.all([
        api.getMe(), api.listAccounts(), api.listTransactions({ query: { limit: 500 } }), api.listGoals(), api.listLifeEvents(), api.listBudgets(),
      ]);
      const day = new Date().toISOString().slice(0, 10);
      if (kind === "json") {
        save(`finvantage-data-${day}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), user, accounts, transactions, goals, lifeEvents, budgets }, null, 2));
        setMessage("Downloaded your data as one JSON file.");
      } else {
        save(`finvantage-transactions-${day}.csv`, "text/csv;charset=utf-8", transactionsCsv(transactions, accounts));
        save(`finvantage-accounts-${day}.csv`, "text/csv;charset=utf-8", accountsCsv(accounts));
        save(`finvantage-goals-${day}.csv`, "text/csv;charset=utf-8", goalsCsv(goals));
        setMessage("Downloaded three CSV files: transactions, accounts and goals.");
      }
    } catch {
      setMessage("Could not prepare the download. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card lift={false} title="Download My Data" subtitle="Your accounts, transactions, goals, life events and budgets">
      <p className="mb-3 text-sm text-muted">The file is made in your browser and goes nowhere else. The latest 500 transactions are included. This is demo data.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void run("json")} className={buttonClass({ variant: "primary" })}>{busy ? "Preparing…" : "Download JSON"}</button>
        <button type="button" disabled={busy} onClick={() => void run("csv")} className={buttonClass({ variant: "secondary" })}>Download CSV</button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink">{message}</p>
    </Card>
  );
}
