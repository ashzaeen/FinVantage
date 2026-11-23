import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await api.listReports();

  return (
    <div>
      <PageHeader title="Reports" subtitle="Your quarterly review, from the numbers on file." />
      <ReportsClient initialReports={reports} />
    </div>
  );
}
