import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await api.getMe();

  return (
    <>
      <PageHeader title="Settings" tier="P0" prd="9" />
      <SettingsClient user={user} />
    </>
  );
}
