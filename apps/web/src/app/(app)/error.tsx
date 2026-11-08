"use client";

import { Card } from "@/components/ui/Card";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card title="Could not load this page">
      <p className="text-sm text-muted">{error.message}</p>
      <p className="mt-2 text-sm text-muted">
        Check that the API is running with <code>npm run dev:api</code>.
      </p>
      <button className="mt-4 text-sm text-accent underline" onClick={reset}>
        Try again
      </button>
    </Card>
  );
}
