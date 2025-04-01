import { z } from 'zod';
import { DbConfigSchema, DbConfig, postgresClient } from '../database.js';

export const listTablesSchema = DbConfigSchema;

export async function listTables(dbConfig: DbConfig) {
  try {
    const result = await postgresClient.query(
      dbConfig,
      `
      SELECT 
        table_schema, 
        table_name,
        table_type
      FROM 
        information_schema.tables 
      WHERE 
        table_schema NOT IN ('pg_catalog', 'information_schema') 
      ORDER BY 
        table_schema, table_name
      `
    );
    
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(result.rows, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Failed to list tables: ${(error as Error).message}` }],
      isError: true
    };
  }
} 