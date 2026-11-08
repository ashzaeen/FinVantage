"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, type BankItemSummary } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { readClaims, readCookie, TOKEN_COOKIE, usableToken } from "@/lib/token";

/** The subset of Plaid Link's browser API used here. https://plaid.com/docs/link/web/ */
interface PlaidLinkHandler {
  open(): void;
  destroy(): void;
}
declare global {
  interface Window {
    Plaid?: {
      create(config: {
        token: string;
        onSuccess: (publicToken: string) => void;
        onExit: (error: { error_message?: string } | null) => void;
      }): PlaidLinkHandler;
    };
  }
}

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaidScript(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAID_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Plaid. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Sign in to connect a bank.";
    if (error.status === 502) return `The bank connection failed: ${error.message}`;
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Banks linked through Plaid, with Connect, Refresh, and Remove. */
export function LinkedBanks({ initialItems }: { initialItems: BankItemSummary[] }) {
  const [items, setItems] = useState(initialItems);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = usableToken(readCookie(document.cookie, TOKEN_COOKIE));
    setSignedIn(Boolean(token && readClaims(token)));
  }, []);

  /** Plaid keeps fetching history for a little while after linking, so sync again twice. */
  async function settle(itemId: string) {
    for (const delay of [8_000, 15_000]) {
      setNotice("Bank connected. Fetching your transactions…");
      await wait(delay);
      await api.syncBankItem({ params: { id: itemId } }).catch(() => undefined);
    }
    window.location.reload();
  }

  async function connect() {
    setError(null);
    setBusy("connect");
    try {
      const [{ linkToken }] = await Promise.all([api.createBankLinkToken(), loadPlaidScript()]);
      const handler = window.Plaid!.create({
        token: linkToken,
        onSuccess: (publicToken) => {
          handler.destroy();
          setNotice("Connecting your bank…");
          api
            .exchangeBankToken({ body: { publicToken } })
            .then((item) => {
              setItems((current) => [...current.filter((i) => i.itemId !== item.itemId), item]);
              return settle(item.itemId);
            })
            .catch((e: unknown) => {
              setNotice(null);
              setError(messageFor(e));
              setBusy(null);
            });
        },
        onExit: (exitError) => {
          handler.destroy();
          if (exitError?.error_message) setError(exitError.error_message);
          setBusy((current) => (current === "connect" ? null : current));
        },
      });
      handler.open();
    } catch (e) {
      setError(messageFor(e));
      setBusy(null);
    }
  }

  async function refresh(itemId: string) {
    setError(null);
    setBusy(itemId);
    try {
      await api.syncBankItem({ params: { id: itemId } });
      window.location.reload();
    } catch (e) {
      setError(messageFor(e));
      setBusy(null);
    }
  }

  async function remove(item: BankItemSummary) {
    if (!window.confirm(`Disconnect ${item.institutionName}? Its accounts and transactions will be removed from FinVantage.`)) return;
    setError(null);
    setBusy(item.itemId);
    try {
      await api.removeBankItem({ params: { id: item.itemId } });
      window.location.reload();
    } catch (e) {
      setError(messageFor(e));
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-3xl border border-[#edf0f7] bg-white p-5 shadow-[0_2px_12px_rgba(22,25,44,0.03)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-poppins text-base font-bold text-[#16192c]">Linked banks</h3>
          <p className="mt-1 text-xs text-[#8d94a8]">
            Connected securely through Plaid. FinVantage reads balances and transactions; it never moves money.
          </p>
        </div>
        {signedIn === false ? (
          <Link
            href="/login?next=/accounts"
            className="self-start rounded-xl border border-[#e6e9f2] px-4 py-2.5 text-sm font-semibold text-[#544af7] hover:bg-[#eef1fc] sm:self-auto"
          >
            Sign in to connect a bank
          </Link>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={signedIn !== true || busy !== null}
            className="self-start rounded-xl bg-[#544af7] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#453bc9] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          >
            {busy === "connect" ? "Opening Plaid…" : "+ Connect a bank"}
          </button>
        )}
      </div>

      {notice && <p aria-live="polite" className="mt-4 rounded-xl bg-[#eef1fc] px-3 py-2.5 text-sm text-[#544af7]">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#ffecee] px-3 py-2.5 text-sm text-[#ff4d6d]">{error}</p>}

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-[#edf0f7] rounded-2xl border border-[#edf0f7]">
          {items.map((item) => (
            <li key={item.itemId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#16192c]">{item.institutionName}</p>
                <p className="text-xs text-[#8d94a8]">
                  {item.accountCount} {item.accountCount === 1 ? "account" : "accounts"}
                  {item.status !== "good" && <span className="ml-2 font-semibold text-[#ff9900]">Needs attention: {item.status}</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => refresh(item.itemId)}
                  disabled={busy !== null}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#544af7] hover:bg-[#eef1fc] disabled:opacity-50"
                >
                  {busy === item.itemId ? "Working…" : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={busy !== null}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#8d94a8] hover:bg-[#f4f5fa] hover:text-[#ff4d6d] disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
