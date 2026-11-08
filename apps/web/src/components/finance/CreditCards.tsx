import Link from "next/link";
import { formatUsd, type Account } from "@finvantage/contracts";

const cardColors = ["#4d4695", "#315f70"];

function CreditCardFace({ account, index, muted = false }: { account: Account; index: number; muted?: boolean }) {
  const initials = account.institution.trim().slice(0, 2).toUpperCase();
  const background = cardColors[index % cardColors.length]!;

  return (
    <article
      aria-label={`${account.institution} ${account.name}, credit card ending ${account.mask ?? "digits unavailable"}`}
      className={`absolute h-[174px] overflow-hidden rounded-[22px] border border-white/15 p-4 text-white ${muted ? "right-0 top-0 z-10 w-[88%]" : "left-0 top-16 z-20 w-[95%]"}`}
      style={{ backgroundColor: background, boxShadow: muted ? "0 7px 18px rgba(22,25,44,.1)" : "0 14px 25px rgba(22,25,44,.2)" }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-14 -right-8 h-36 w-36 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-2 h-24 w-24 rounded-full border border-white/10" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-[10px] font-bold">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-white/75">{account.institution}</p>
            <p className="truncate text-sm font-semibold">{account.name}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em]">Credit</span>
      </div>
      <div className="relative mt-4 flex items-center gap-2 text-sm font-medium tracking-[.18em] tabular-nums text-white/90">
        <span aria-hidden="true" className="text-[10px] tracking-normal text-white/55">••••</span>
        <span>••••</span><span>••••</span><span>{account.mask ?? "••••"}</span>
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-[10px] text-white/65">Account balance and available credit below</p>
        <span aria-hidden="true" className="flex shrink-0 items-center -space-x-2">
          <i className="h-5 w-5 rounded-full bg-[#f6f0d8]/90" />
          <i className="h-5 w-5 rounded-full bg-[#df9b45]/90" />
        </span>
      </div>
    </article>
  );
}

/** Real credit accounts shown as a layered card preview with masked account numbers. */
export function CreditCards({ accounts }: { accounts: Account[] }) {
  const cards = accounts.filter((account) => account.type === "credit_card").slice(0, 2);

  if (cards.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9ddec] px-5 text-center">
        <p className="text-sm font-semibold text-[#16192c]">No credit cards connected</p>
        <p className="mt-1 text-xs leading-5 text-[#8d94a8]">Connect or add a credit card to see its balance and available credit here.</p>
        <Link href="/accounts" className="mt-4 rounded-xl bg-[#eef1fc] px-4 py-2.5 text-sm font-semibold text-[#544af7] transition hover:bg-[#e2e6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">Manage Accounts</Link>
      </div>
    );
  }

  const faceAccounts = cards.length === 1 ? [cards[0]!] : [cards[1]!, cards[0]!];

  return (
    <div>
      <div className={`relative ${cards.length > 1 ? "h-[242px]" : "h-[204px]"}`} aria-label="Credit card previews">
        {faceAccounts.map((account, index) => <CreditCardFace key={account.id} account={account} index={index} muted={cards.length > 1 && index === 0} />)}
      </div>
      <div className="space-y-3 border-t border-[#edf0f7] pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8d94a8]">Card balances</p>
        {cards.map((account) => {
          const limit = account.creditLimitCents ?? 0;
          const available = account.availableBalanceCents ?? Math.max(0, limit - account.balanceCents);
          const utilization = limit > 0 ? Math.min(100, Math.round((account.balanceCents / limit) * 100)) : null;
          return <div key={account.id} className="rounded-xl bg-[#f8f9fe] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-medium text-[#4a4f68]">{account.name}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[#16192c]">{formatUsd(account.balanceCents)} owed</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-[#8d94a8]">
              <span>{limit > 0 ? `${formatUsd(available)} available` : "Credit limit not provided"}</span>
              {utilization !== null && <span className="shrink-0 tabular-nums">{utilization}% used</span>}
            </div>
            {utilization !== null && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white" role="progressbar" aria-label={`${account.name} credit utilization`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilization}><div className="h-full rounded-full bg-[#544af7]" style={{ width: `${utilization}%` }} /></div>}
          </div>;
        })}
      </div>
      {accounts.filter((account) => account.type === "credit_card").length > 2 && <Link href="/accounts" className="mt-3 block text-center text-xs font-semibold text-[#544af7] hover:underline">View all credit cards</Link>}
    </div>
  );
}
