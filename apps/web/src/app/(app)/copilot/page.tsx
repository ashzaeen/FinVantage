import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { CopilotFeed } from "./CopilotFeed";
import { CopilotImpactTiles } from "./CopilotImpactTiles";
import { InstallExtension } from "./InstallExtension";

export default async function CopilotPage() {
  const [events, impact] = await Promise.all([api.listCopilotEvents(), api.getCopilotImpact().catch(() => null)]);

  return (
    <>
      <PageHeader title="Copilot" />
      <div className="space-y-6">
        <InstallExtension />
        {impact && <CopilotImpactTiles impact={impact} />}
        <section aria-labelledby="copilot-activity-heading" className="space-y-4">
          <h2 id="copilot-activity-heading" className="font-poppins text-xl font-bold text-ink">Activity</h2>
          <CopilotFeed initial={events} />
        </section>
      </div>
    </>
  );
}
