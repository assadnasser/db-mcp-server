import { queryHistoryStore } from '../query-history.js';

export async function getQueryHistory(connectionId: string, limit?: number) {
  try {
    const history = await queryHistoryStore.getRecentQueries(connectionId, limit);
    return history;
  } catch (error) {
    throw new Error(`Error getting query history: ${(error as Error).message}`);
  }
} 