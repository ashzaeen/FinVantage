import { PageHeader } from "@/components/ui/PageHeader";
import { AdvisorClient } from "./AdvisorClient";

export default function AdvisorPage() {
  return (
    <>
      <PageHeader title="Advisor" tier="P1" prd="7.1" />
      <AdvisorClient />
    </>
  );
}
