// W3 probe: can a visitor make the server email a report to an address they choose?
// Local API only. Run with MAIL_PROVIDER unset (mock mail): nothing is delivered anywhere.
// The recipient uses example.com, a domain reserved for documentation that can't receive mail.
// Run from the repo root with the API up: npx tsx docs/security-review/w3-email-probe.ts
const API = "http://localhost:4000";
const OTHER_PERSON = "someone-else@example.com";

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

async function main() {
  const health = (await (await fetch(`${API}/health`)).json()) as Record<string, unknown>;
  console.log("API:", JSON.stringify(health));

  // 1. The public demo token (after the W1 fix).
  const demo = await call("demo-token", "POST", "/v1/reports/quarterly", { email: false });
  console.log(`demo-token  generate report            -> HTTP ${demo.status} ${demo.json.error?.code ?? ""}`);

  // 2. A guest session, as any signed-out visitor gets.
  const guest = ((await (await fetch(`${API}/auth/guest`, { method: "POST" })).json()) as { token: string }).token;
  const report = await call(guest, "POST", "/v1/reports/quarterly", { email: false });
  console.log(`guest       generate report            -> HTTP ${report.status} pdf=${report.json.pdf?.status} id=${report.json.id}`);

  const sent = await call(guest, "POST", `/v1/reports/quarterly/${report.json.id}/email`, { to: OTHER_PERSON });
  console.log(`guest       email report to ${OTHER_PERSON} -> HTTP ${sent.status} email.status=${sent.json.email?.status ?? sent.json.error?.code}`);

  const schedule = await call(guest, "POST", "/v1/reports/schedule", { enabled: true, frequency: "monthly", recipientEmail: OTHER_PERSON });
  console.log(`guest       schedule monthly to ${OTHER_PERSON} -> HTTP ${schedule.status} saved recipient=${schedule.json.recipientEmail ?? schedule.json.error?.code}`);

  const me = await call(guest, "GET", "/v1/me");
  console.log(`guest       account email on file      -> ${JSON.stringify(me.json.email ?? null)}`);
}

void main();
