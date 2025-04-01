import { z } from 'zod';
import { DbConfigSchema, DbConfig } from '../database.js';
import { queryHistoryStore, getConnectionId } from '../query-history.js';

export const clearQueryHistorySchema = DbConfigSchema;

export async function clearQueryHistory(dbConfig: DbConfig) {
  try {
    const connectionId = getConnectionId(dbConfig);
    await queryHistoryStore.clearHistory(connectionId);
    
    return {
      content: [{ 
        type: 'text', 
        text: 'Query history cleared successfully'
      }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Failed to clear query history: ${(error as Error).message}` }],
      isError: true
    };
  }
} 