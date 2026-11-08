import {
  DEFAULT_SPENDING_CATEGORIES,
  canonicalCategoryId,
  categoryBucket,
  parentCategoryId,
  type CategoryRule,
  type SpendingBucket,
  type SpendingCategory,
  type Transaction,
} from "@finvantage/contracts";
import type { SpendingProfile } from "@finvantage/data";

/** The user's categories: defaults with their changes, plus their own, in display order. */
export interface Catalog {
  list: SpendingCategory[];
  byId: Map<string, SpendingCategory>;
}

/**
 * Resolves buckets top-down: a category's own bucket if the user set one, otherwise its
 * parent's. Income and Transfers stay excluded whatever the user sets.
 */
export function buildCatalog(profile: SpendingProfile): Catalog {
  const overrides = new Map(profile.overrides.map((o) => [o.id, o]));
  const byId = new Map<string, SpendingCategory>();
  const children = new Map<string | null, SpendingCategory[]>();

  const add = (category: SpendingCategory) => {
    byId.set(category.id, category);
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category);
    children.set(category.parentId, siblings);
  };
  const inherit = (parentId: string | null, own: SpendingBucket | null, fallback: SpendingBucket): SpendingBucket => {
    const parent = parentId ? byId.get(parentId) : undefined;
    if (fallback === "excluded" || parent?.bucket === "excluded") return "excluded";
    return own ?? parent?.bucket ?? fallback;
  };

  // Defaults list parents before children, so each parent is resolved first.
  for (const def of DEFAULT_SPENDING_CATEGORIES) {
    const o = overrides.get(def.id);
    add({
      id: def.id,
      label: o?.label ?? def.label,
      bucket: inherit(def.parentId, o?.bucket ?? null, def.bucket),
      parentId: def.parentId,
      custom: false,
      hidden: o?.hidden ?? false,
    });
  }
  const customs = [...profile.categories].sort((a, b) => a.id.split(".").length - b.id.split(".").length);
  for (const c of customs) {
    const parent = byId.get(c.parentId);
    if (!parent) continue;
    add({ id: c.id, label: c.label, bucket: inherit(c.parentId, c.bucket, parent.bucket), parentId: c.parentId, custom: true, hidden: c.hidden });
  }

  const list: SpendingCategory[] = [];
  const walk = (parentId: string | null) => {
    for (const child of children.get(parentId) ?? []) {
      list.push(child);
      walk(child.id);
    }
  };
  walk(null);
  return { list, byId };
}

/** The most specific category a transaction carries, translating ids from before the redesign. */
export function categoryIdOf(transaction: Pick<Transaction, "category" | "subcategory">): string | null {
  return transaction.subcategory ?? (transaction.category ? canonicalCategoryId(transaction.category) : null);
}

/** A transaction's bucket: from its deepest category the catalog knows, else the default. */
export function bucketOf(catalog: Catalog, transaction: Pick<Transaction, "category" | "subcategory">): SpendingBucket | null {
  const id = categoryIdOf(transaction);
  for (let cur = id; cur; cur = parentCategoryId(cur)) {
    const known = catalog.byId.get(cur);
    if (known) return known.bucket;
  }
  return categoryBucket(id);
}

/** Money out that is not income or a transfer. */
export function isSpending(catalog: Catalog, transaction: Transaction): boolean {
  return transaction.amountCents < 0 && bucketOf(catalog, transaction) !== "excluded";
}

/** Whether a transaction counts toward a budget on `categoryId`, including its subcategories. */
export function countsToward(categoryId: string, transaction: Pick<Transaction, "category" | "subcategory">): boolean {
  const id = categoryIdOf(transaction);
  return !!id && (id === categoryId || id.startsWith(`${categoryId}.`));
}

/** The category a merchant rule assigns, longest match first. Null when no rule matches. */
export function ruleCategoryFor(rules: CategoryRule[], merchant: string): string | null {
  const name = merchant.toLowerCase();
  const match = rules
    .filter((rule) => name.includes(rule.merchantContains.toLowerCase()))
    .sort((a, b) => b.merchantContains.length - a.merchantContains.length)[0];
  return match?.categoryId ?? null;
}
