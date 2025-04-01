import { z } from 'zod';
import { DbConfigSchema, DbConfig, postgresClient } from '../database.js';

export const getDatabaseStatsSchema = DbConfigSchema;

export async function getDatabaseStats(dbConfig: DbConfig) {
  try {
    const stats = postgresClient.getStats(dbConfig);
    const dbSize = await postgresClient.getDatabaseSize(dbConfig);
    const activity = await postgresClient.getDatabaseActivity(dbConfig);
    
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          queryStats: stats,
          databaseSize: dbSize,
          currentActivity: activity
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Failed to get database stats: ${(error as Error).message}` }],
      isError: true
    };
  }
} 