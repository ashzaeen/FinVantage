import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { CopilotFeed } from "./CopilotFeed";
import { InstallExtension } from "./InstallExtension";

export default async function CopilotPage() {
  const events = await api.listCopilotEvents();

  return (
    <>
      <PageHeader title="Copilot" />
      <div className="space-y-6">
        <InstallExtension />
        <section aria-labelledby="copilot-activity-heading" className="space-y-4">
          <h2 id="copilot-activity-heading" className="font-poppins text-xl font-bold text-[#16192c]">Activity</h2>
          <CopilotFeed initial={events} />
        </section>
      </div>
    </>
  );
}
