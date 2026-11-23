import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { HealthScoreCard } from "../app/OverviewPlanning";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [reports, health] = await Promise.all([api.listReports(), api.getHealthScore().catch(() => null)]);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Your quarterly review, from the numbers on file." />
      {health && <div className="mb-6 max-w-md"><HealthScoreCard health={health} /></div>}
      <ReportsClient initialReports={reports} />
    </div>
  );
}
