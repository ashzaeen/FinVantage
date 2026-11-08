import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await api.listReports();

  return (
    <div style={{ textTransform: "capitalize" }}>
      <PageHeader title="Quarterly Reports" tier="P2" prd="7.2" />
      <ReportsClient initialReports={reports} />
    </div>
  );
}
