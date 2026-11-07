import type { DocumentStore } from "../stores";

/**
 * STUB(platform): implement DocumentStore against MongoDB Atlas.
 * Collections: life_events, simulation_runs, copilot_events, recommendations, reports.
 */
export function createMongoDocumentStore(_uri: string): DocumentStore {
  throw new Error("MongoDB Atlas store not implemented yet. Set DATA_BACKEND=memory.");
}
