import { z } from 'zod';
import { DbConfigSchema, DbConfig } from '../database.js';
import { queryHistoryStore, getConnectionId } from '../query-history.js';

export const getQueryHistorySchema = z.object({
  ...DbConfigSchema.shape,
  limit: z.number().optional()
});

export type GetQueryHistoryParams = {
  limit?: number;
} & DbConfig;

export async function getQueryHistory({ limit, ...dbConfig }: GetQueryHistoryParams) {
  try {
    const connectionId = getConnectionId(dbConfig as DbConfig);
    const history = await queryHistoryStore.getRecentQueries(connectionId, limit);
    
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(history, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Failed to get query history: ${(error as Error).message}` }],
      isError: true
    };
  }
} 