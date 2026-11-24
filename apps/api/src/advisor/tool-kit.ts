import { z } from "zod";
import type { AdvisorTool, AdvisorToolResult, AdvisorTurnState } from "@finvantage/llm";

/** Declares one Advisor tool: its arguments are checked before `run` sees them, so a bad call is an error the model can read. */
export function tool<S extends z.ZodObject>(
  name: string,
  description: string,
  params: S,
  run: (args: z.output<S>, turn: AdvisorTurnState) => Promise<AdvisorToolResult>,
): AdvisorTool {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(params) as Record<string, unknown>;
  return {
    name,
    description,
    parameters,
    run: async (raw, turn) => {
      const parsed = params.safeParse(raw);
      if (!parsed.success) throw new Error(`Bad arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      return run(parsed.data, turn);
    },
  };
}

export const none = z.object({});
