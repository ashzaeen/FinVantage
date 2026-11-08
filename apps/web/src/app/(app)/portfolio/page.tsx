import { api } from "@/lib/api";
import { InvestmentsClient } from "./InvestmentsClient";

export default async function PortfolioPage() {
  const data = await api.getInvestments();
  return <InvestmentsClient data={data} />;
}
