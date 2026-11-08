"use client";

import type { AdvisorVisual as Visual } from "@finvantage/contracts";
import { CardEvaluator } from "./CardEvaluator";
import { GoalPlanner } from "./GoalPlanner";
import { GrowthCompare } from "./GrowthCompare";
import { LoanExplorer } from "./LoanExplorer";

/** Picks the interactive visual for an Advisor answer. */
export function AdvisorVisual({ visual, id }: { visual: Visual; id: string }) {
  switch (visual.kind) {
    case "loan_explorer":
      return <LoanExplorer initial={visual} />;
    case "goal_plan":
      return <GoalPlanner initial={visual} id={id} />;
    case "growth_compare":
      return <GrowthCompare initial={visual} />;
    case "card_evaluator":
      return <CardEvaluator initial={visual} />;
  }
}
