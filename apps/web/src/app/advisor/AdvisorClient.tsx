"use client";

import { useState, type FormEvent } from "react";
import type { Recommendation } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

export function AdvisorClient() {
  const [question, setQuestion] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const situation = { kind: "user_question" as const, question };
    setRecommendation(await api.getAdvice({ body: { situation } }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={ask} className="flex gap-2 text-sm">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Can I afford a car next year?"
            aria-label="Your question"
            className="flex-1 rounded border border-line bg-surface p-2"
          />
          <button className="rounded bg-accent px-3 py-1.5 text-surface" disabled={!question}>
            Ask
          </button>
        </form>
      </Card>
      {recommendation?.options.map((option) => (
        <Card key={option.rank} title={`${option.rank}. ${option.title}`}>
          <p className="text-sm text-muted">{option.tradeOff}</p>
          <ul className="mt-2 text-sm">
            {option.figures.map((figure) => (
              <li key={figure.label}>
                {figure.label}: {figure.value}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
