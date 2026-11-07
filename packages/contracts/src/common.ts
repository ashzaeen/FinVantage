import { z } from "zod";

export const Id = z.string().min(1);

/** Integer US cents. Every money field ends in `Cents`. Use `formatUsd` to display. */
export const Cents = z.number().int();

/** Decimal fraction: 0.0525 means 5.25%. */
export const Rate = z.number();

/** 0 to 1. */
export const Probability = z.number().min(0).max(1);

export const IsoDate = z.iso.date();
export const IsoDateTime = z.iso.datetime();

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
