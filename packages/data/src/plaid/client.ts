/**
 * A small Plaid API client over fetch (no SDK). Every response is parsed with the Plaid schemas,
 * so the rest of the app only ever sees validated Plaid objects. Server-side only: it holds the
 * client secret and access tokens.
 *
 * https://plaid.com/docs/api/
 */
import { z } from "zod";
import {
  PlaidAccount,
  PlaidHolding,
  PlaidLiabilities,
  PlaidRecurringStream,
  PlaidSecurity,
  PlaidTransactionsSync,
  type PlaidItemSnapshot,
  type PlaidTransaction,
} from "./schema";

export type PlaidEnv = "sandbox" | "production";

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnv;
}

export class PlaidApiError extends Error {
  constructor(
    readonly errorCode: string,
    readonly errorType: string,
    message: string,
    readonly status: number,
  ) {
    super(`Plaid ${errorCode}: ${message}`);
  }
}

/** One item's latest data, ready to apply to a ledger store. */
export interface BankItemUpdate {
  item: PlaidItemSnapshot["item"];
  accounts: PlaidAccount[];
  /** From /transactions/sync, all pages since the previous cursor. */
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removedTransactionIds: string[];
  nextCursor: string;
  liabilities: PlaidLiabilities;
  recurring: PlaidItemSnapshot["recurring"];
  investments: PlaidItemSnapshot["investments"];
}

// Errors that mean "this item has none of that", not a failure.
const EMPTY_PRODUCT_ERRORS = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_READY",
  "NO_LIABILITY_ACCOUNTS",
  "NO_INVESTMENT_ACCOUNTS",
  "NO_INVESTMENT_AUTH_ACCOUNTS",
  "ADDITIONAL_CONSENT_REQUIRED",
  "INVALID_PRODUCT",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PlaidClient {
  constructor(
    private readonly config: PlaidConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<unknown> = sleep,
  ) {}

  private get baseUrl() {
    return this.config.env === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  }

  get env(): PlaidEnv {
    return this.config.env;
  }

  async post<T extends z.ZodType>(path: string, body: Record<string, unknown>, schema: T): Promise<z.output<T>> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: this.config.clientId, secret: this.config.secret, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.error_code) {
      throw new PlaidApiError(
        String(json.error_code ?? "UNKNOWN"),
        String(json.error_type ?? "API_ERROR"),
        String(json.error_message ?? `HTTP ${res.status}`),
        res.status,
      );
    }
    return schema.parse(json);
  }

  /** Runs `call`, but returns `empty` when the item simply doesn't have that product. */
  private async optional<T>(call: () => Promise<T>, empty: T): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof PlaidApiError && EMPTY_PRODUCT_ERRORS.has(error.errorCode)) return empty;
      throw error;
    }
  }

  async createLinkToken(userId: string): Promise<string> {
    const { link_token } = await this.post(
      "/link/token/create",
      {
        user: { client_user_id: userId },
        client_name: "FinVantage",
        products: ["transactions"],
        optional_products: ["liabilities", "investments"],
        transactions: { days_requested: 730 },
        country_codes: ["US"],
        language: "en",
      },
      z.object({ link_token: z.string() }),
    );
    return link_token;
  }

  async exchangePublicToken(publicToken: string): Promise<{ itemId: string; accessToken: string }> {
    const res = await this.post(
      "/item/public_token/exchange",
      { public_token: publicToken },
      z.object({ access_token: z.string(), item_id: z.string() }),
    );
    return { itemId: res.item_id, accessToken: res.access_token };
  }

  /** Sandbox only: a public token for a test bank, as if the user had gone through Link. */
  async createSandboxPublicToken(institutionId = "ins_109508"): Promise<string> {
    const { public_token } = await this.post(
      "/sandbox/public_token/create",
      { institution_id: institutionId, initial_products: ["transactions", "liabilities", "investments"] },
      z.object({ public_token: z.string() }),
    );
    return public_token;
  }

  async removeItem(accessToken: string): Promise<void> {
    await this.post("/item/remove", { access_token: accessToken }, z.object({}).passthrough());
  }

  /**
   * Everything for one item. Transactions come from /transactions/sync starting after `cursor`
   * (null for the first sync). Right after linking, Plaid may still be fetching history: an
   * empty first sync is retried briefly, and the web app syncs again a little later.
   */
  async fetchItem(accessToken: string, cursor: string | null): Promise<BankItemUpdate> {
    const { item } = await this.post(
      "/item/get",
      { access_token: accessToken },
      z.object({ item: z.object({ item_id: z.string(), institution_id: z.string().nullable().optional() }) }),
    );
    const institutionId = item.institution_id ?? null;
    const institutionName = institutionId
      ? await this.optional(
          async () =>
            (
              await this.post(
                "/institutions/get_by_id",
                { institution_id: institutionId, country_codes: ["US"] },
                z.object({ institution: z.object({ name: z.string() }) }),
              )
            ).institution.name,
          "Linked bank",
        )
      : "Linked bank";

    const { accounts } = await this.post(
      "/accounts/get",
      { access_token: accessToken },
      z.object({ accounts: z.array(PlaidAccount) }),
    );

    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: string[] = [];
    let next = cursor;
    for (let attempt = 0; ; attempt++) {
      const page = await this.post(
        "/transactions/sync",
        { access_token: accessToken, count: 500, ...(next ? { cursor: next } : {}) },
        PlaidTransactionsSync.extend({ transactions_update_status: z.string().optional() }),
      );
      added.push(...page.added);
      modified.push(...page.modified);
      removed.push(...page.removed.map((r) => r.transaction_id));
      next = page.next_cursor;
      if (page.has_more) continue;
      const notReady = page.transactions_update_status === "NOT_READY";
      if (cursor === null && added.length === 0 && notReady && attempt < 4) {
        await this.wait(1500);
        continue;
      }
      break;
    }

    const liabilities = await this.optional(
      async () =>
        (
          await this.post(
            "/liabilities/get",
            { access_token: accessToken },
            z.object({ liabilities: PlaidLiabilities.partial() }),
          )
        ).liabilities,
      {},
    );
    const recurring = await this.optional(
      () =>
        this.post(
          "/transactions/recurring/get",
          { access_token: accessToken },
          z.object({ inflow_streams: z.array(PlaidRecurringStream), outflow_streams: z.array(PlaidRecurringStream) }),
        ),
      { inflow_streams: [], outflow_streams: [] },
    );
    const investments = await this.optional(
      () =>
        this.post(
          "/investments/holdings/get",
          { access_token: accessToken },
          z.object({ holdings: z.array(PlaidHolding), securities: z.array(PlaidSecurity) }),
        ),
      { holdings: [], securities: [] },
    );

    return {
      item: { item_id: item.item_id, institution_id: institutionId, institution_name: institutionName },
      accounts,
      added,
      modified,
      removedTransactionIds: removed,
      nextCursor: next ?? "",
      liabilities: {
        credit: liabilities.credit ?? null,
        mortgage: liabilities.mortgage ?? null,
        student: liabilities.student ?? null,
      },
      recurring: { inflow_streams: recurring.inflow_streams, outflow_streams: recurring.outflow_streams },
      investments: { holdings: investments.holdings, securities: investments.securities },
    };
  }
}
