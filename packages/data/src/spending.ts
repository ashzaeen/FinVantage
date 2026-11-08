import { z } from "zod";
import {
  BudgetLimit,
  BudgetedBucket,
  CategoryRule,
  DEFAULT_SPENDING_SPLIT,
  SpendingSplit,
} from "@finvantage/contracts";
import { loadDemoProfileFixture } from "./profile";

/** A subcategory the user made. Its id starts with its parent's id. */
export const CustomCategoryRecord = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  parentId: z.string().min(1),
  /** Null inherits the parent's bucket. */
  bucket: BudgetedBucket.nullable(),
  hidden: z.boolean(),
});
export type CustomCategoryRecord = z.infer<typeof CustomCategoryRecord>;

/** The user's changes to a default category. Null fields keep the default. */
export const CategoryOverride = z.object({
  id: z.string().min(1),
  label: z.string().nullable(),
  hidden: z.boolean(),
  bucket: BudgetedBucket.nullable(),
});
export type CategoryOverride = z.infer<typeof CategoryOverride>;

/**
 * Everything the Spending module stores for one user, as one document: the split, custom
 * categories, changes to defaults, budgets and merchant rules.
 */
export const SpendingProfile = z.object({
  userId: z.string().min(1),
  split: SpendingSplit,
  categories: z.array(CustomCategoryRecord),
  overrides: z.array(CategoryOverride),
  budgets: z.array(BudgetLimit),
  rules: z.array(CategoryRule),
});
export type SpendingProfile = z.infer<typeof SpendingProfile>;

/** Memory by default; MongoDB in production (`mongo/spending.ts`). */
export interface SpendingStore {
  /** The user's profile, starting from the defaults and the demo budgets the first time. */
  get(userId: string): Promise<SpendingProfile>;
  save(profile: SpendingProfile): Promise<SpendingProfile>;
}

/** A new user's starting point: 50/30/20, no custom categories, and the demo budgets. */
export function defaultSpendingProfile(userId: string): SpendingProfile {
  return {
    userId,
    split: DEFAULT_SPENDING_SPLIT,
    categories: [],
    overrides: [],
    budgets: loadDemoProfileFixture().budgets,
    rules: [],
  };
}

export class MemorySpendingStore implements SpendingStore {
  private profiles = new Map<string, SpendingProfile>();

  async get(userId: string) {
    return structuredClone(this.profiles.get(userId) ?? defaultSpendingProfile(userId));
  }

  async save(profile: SpendingProfile) {
    const saved = SpendingProfile.parse(profile);
    this.profiles.set(saved.userId, structuredClone(saved));
    return saved;
  }
}
