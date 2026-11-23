import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

/**
 * The one button vocabulary. Every filled, outlined or quiet button in the dashboard is one of these, so
 * the same action looks the same on every page: one shape (rounded-xl), three sizes, one focus ring.
 * Sizes here are the mouse sizes. Below 1024px every size is at least 44px tall, for links as well as buttons
 * (the rule at the end of globals.css only covers real <button> elements).
 */
export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  /** The one main action on a surface. White text on the accent fill, 5.7:1. */
  primary: "bg-accent text-white hover:bg-[color:var(--accent-hover)]",
  /** A second action beside a primary, or the only action when none is the main one. */
  secondary: "border border-line bg-raised text-ink hover:bg-inset",
  /** A low-emphasis action inside a card or a row. */
  quiet: "bg-accent-soft text-accent-ink hover:bg-accent-soft-hover",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5 text-xs max-lg:min-h-11",
  md: "min-h-10 px-4 py-2 text-sm max-lg:min-h-11",
  lg: "min-h-12 px-5 py-3 text-sm",
};

/** The classes for a button, for elements that are not a plain <button> (a Link, a label). */
export function buttonClass(options: { variant?: ButtonVariant; size?: ButtonSize } = {}, extra = ""): string {
  const { variant = "primary", size = "md" } = options;
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}${extra ? ` ${extra}` : ""}`;
}

export function Button({
  variant,
  size,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...rest} />;
}

export function ButtonLink({
  href,
  variant,
  size,
  className = "",
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link href={href} className={buttonClass({ variant, size }, className)} {...rest} />;
}
