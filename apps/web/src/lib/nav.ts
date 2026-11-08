export interface NavItem {
  href: string;
  label: string;
  /** One line under the label. Only the Intelligence items have one. */
  hint?: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const OVERVIEW_ITEM: NavItem = { href: "/app", label: "Overview" };

/** The features that think for the user, then the pages that show their money. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Intelligence",
    items: [
      { href: "/advisor", label: "Advisor", hint: "Ask about your money" },
      { href: "/copilot", label: "Copilot", hint: "Check a purchase first" },
      { href: "/life-events", label: "Life Events", hint: "Plan what comes next" },
      { href: "/reports", label: "Reports", hint: "Your quarterly review" },
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/accounts", label: "Accounts" },
      { href: "/transactions", label: "Transactions" },
      { href: "/goals", label: "Goals" },
      { href: "/income", label: "Income" },
      { href: "/spending", label: "Spending" },
      { href: "/portfolio", label: "Investments" },
      { href: "/credit", label: "Credit" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings" };

/** Every item in display order, for the phone bar. */
export const NAV_ITEMS: readonly NavItem[] = [
  OVERVIEW_ITEM,
  ...NAV_GROUPS.flatMap((g) => g.items),
  SETTINGS_ITEM,
];
