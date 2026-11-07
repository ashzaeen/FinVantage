import { createApiClient } from "@finvantage/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const API_TOKEN = process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "demo-token";

/** Works in server and client components. Every response is validated against the contracts. */
export const api = createApiClient({ baseUrl: API_URL, token: API_TOKEN });
