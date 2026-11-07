import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function ReportsPage() {
  const reports = await api.listReports();

  return (
    <>
      <PageHeader title="Quarterly reports" tier="P2" prd="7.2" />
      <Card>
        {reports.length === 0 && <p className="text-sm text-muted">No reports yet.</p>}
        {reports.map((report) => (
          <article key={report.id} className="text-sm">
            <h3 className="font-medium">{report.quarter}</h3>
            <p className="text-muted">{report.why}</p>
          </article>
        ))}
      </Card>
    </>
  );
}
