import { Card } from "@/components/ui/Card";
import { EXTENSION_FIELDS, NEVER_SENT } from "@/lib/privacy";

/**
 * Says plainly what the Chrome extension shares. The list is `CopilotContext`, checked by a test,
 * so this page cannot claim less or more than what is really sent.
 */
export function PrivacyCenter() {
  return (
    <Card lift={false} title="Privacy Center" subtitle="What the Copilot extension shares when you open a shopping page">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="privacy-sent">
          <h3 id="privacy-sent" className="text-sm font-semibold text-ink">Sent: Four Things</h3>
          <dl className="mt-2 space-y-2">
            {EXTENSION_FIELDS.map((f) => (
              <div key={f.key} className="rounded-xl bg-inset px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm font-medium text-ink">{f.label}</dt>
                  <dd className="shrink-0 rounded-md bg-raised px-2 py-0.5 font-mono text-xs text-ink-secondary">{f.example}</dd>
                </div>
                <p className="mt-0.5 text-xs text-muted">{f.note}</p>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="privacy-never">
          <h3 id="privacy-never" className="text-sm font-semibold text-ink">Never Sent</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-secondary">
            {NEVER_SENT.map((item) => (
              <li key={item} className="flex items-center gap-2"><span aria-hidden="true" className="text-gain">✓</span>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            The server refuses any request with a fifth field. The extension only suggests: it never clicks, buys or moves money on a page.
          </p>
        </section>
      </div>
    </Card>
  );
}
