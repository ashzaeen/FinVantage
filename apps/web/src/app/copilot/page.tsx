import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { CopilotFeed } from "./CopilotFeed";

export default async function CopilotPage() {
  const events = await api.listCopilotEvents();

  return (
    <>
      <PageHeader title="Copilot activity" tier="P0" prd="6" />
      <CopilotFeed initial={events} />
    </>
  );
}
