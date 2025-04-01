import { z } from 'zod';
import { DbConfigSchema } from '../database.js';
import { postgresClient } from '../database.js';
import { DbConfig } from '../database.js';

export const testConnectionSchema = DbConfigSchema;

export async function testConnection(config: DbConfig) {
  try {
    await postgresClient.getConnection(config);
    return {
      content: [{ type: 'text', text: 'Connection successful!' }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Connection failed: ${(error as Error).message}` }],
      isError: true
    };
  }
} 