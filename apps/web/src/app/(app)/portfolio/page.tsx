// Interaction and motion: cards lift on hover (`card-lift`, or `tile-lift` for small tiles and rows),
// and the page opens with `page-cascade`, `CountUp`, and animated charts, like the other tabs.
// See "Interaction and motion" in apps/web/AGENTS.md.
import { api } from "@/lib/api";
import { InvestmentsClient } from "./InvestmentsClient";

export default async function PortfolioPage() {
  const data = await api.getInvestments();
  return <InvestmentsClient data={data} />;
}
