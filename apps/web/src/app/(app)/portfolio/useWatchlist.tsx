"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WatchlistItem } from "@finvantage/contracts";

const STORAGE_KEY = "finvantage.watchlist.v1";

function readSaved(known: ReadonlyMap<string, WatchlistItem>): string[] | null {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string" && known.has(s)) : null;
  } catch {
    return null;
  }
}

function save(symbols: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // The list still works for this visit when browser storage is blocked.
  }
}

export interface Watchlist {
  known: ReadonlyMap<string, WatchlistItem>;
  items: WatchlistItem[];
  available: WatchlistItem[];
  has: (symbol: string) => boolean;
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
}

/** Shared by the Watchlist tile and the Add to Watchlist buttons on the other tiles. */
export function useWatchlist(options: WatchlistItem[], defaults: string[]): Watchlist {
  const known = useMemo(() => new Map(options.map((option) => [option.symbol, option])), [options]);
  const [symbols, setSymbols] = useState(defaults);

  useEffect(() => {
    const saved = readSaved(known);
    if (saved) setSymbols(saved);
  }, [known]);

  const update = useCallback((change: (current: string[]) => string[]) => {
    setSymbols((current) => {
      const next = change(current);
      save(next);
      return next;
    });
  }, []);

  return {
    known,
    items: symbols.flatMap((symbol) => known.get(symbol) ?? []),
    available: options.filter((option) => !symbols.includes(option.symbol)),
    has: (symbol) => symbols.includes(symbol),
    add: (symbol) => update((current) => (current.includes(symbol) ? current : [...current, symbol])),
    remove: (symbol) => update((current) => current.filter((s) => s !== symbol)),
  };
}

/** Adds a symbol to the Watchlist, or removes it. Renders nothing for symbols it cannot follow. */
export function WatchToggle({ symbol, watchlist }: { symbol: string; watchlist: Watchlist }) {
  if (!watchlist.known.has(symbol)) return null;
  const watching = watchlist.has(symbol);
  return (
    <button
      type="button"
      aria-pressed={watching}
      onClick={() => (watching ? watchlist.remove(symbol) : watchlist.add(symbol))}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
        watching ? "bg-good-bg text-gain hover:bg-critical-bg hover:text-loss" : "bg-accent-soft text-accent hover:bg-accent hover:text-white"
      }`}
    >
      {watching ? "✓ On Watchlist" : "+ Add to Watchlist"}
    </button>
  );
}
