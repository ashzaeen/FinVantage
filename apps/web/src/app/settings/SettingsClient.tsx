"use client";

import { useState } from "react";
import type { User } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

export function SettingsClient({ user: initial }: { user: User }) {
  const [user, setUser] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);

  async function toggleCopilot() {
    const body = { ...user.extensionSettings, enabled: !user.extensionSettings.enabled };
    setUser(await api.updateExtensionSettings({ body }));
  }

  async function loadDemo() {
    const result = await api.loadDemoProfile();
    setStatus(`Loaded ${result.accounts} demo accounts.`);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Copilot">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={user.extensionSettings.enabled}
            onChange={toggleCopilot}
          />
          Show cards on shopping and listing pages
        </label>
      </Card>
      <Card title="Demo data">
        <button className="rounded bg-accent px-3 py-1.5 text-sm text-surface" onClick={loadDemo}>
          Reload demo profile
        </button>
        {status && <p className="mt-2 text-sm text-muted">{status}</p>}
      </Card>
    </div>
  );
}
