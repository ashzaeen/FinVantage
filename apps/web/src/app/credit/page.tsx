import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function CreditPage() {
  const credit = await api.getCreditScore();

  return (
    <>
      <PageHeader title="Credit score" tier="P2" prd="4 (#9)" />
      <Card>
        <MockedBadge />
        <p className="mt-2 text-3xl tabular-nums">{credit.score}</p>
      </Card>
    </>
  );
}
