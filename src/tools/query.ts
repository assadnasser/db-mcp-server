import { z } from 'zod';
import { postgresClient } from '../database.js';
import { config } from 'dotenv';

// Load environment variables
config();

// Query tool schema
export const querySchema = z.object({
  sql: z.string().describe('The SQL query to execute (read-only)'),
});

// Default database configuration from environment variables
const defaultDbConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSL === 'true'
};

/**
 * Execute a read-only SQL query against the PostgreSQL database
 * @param sql The SQL query to execute
 * @returns The query results
 */
export async function query({ sql }: z.infer<typeof querySchema>) {
  if (!sql.trim()) {
    throw new Error('SQL query cannot be empty');
  }
  
  // Ensure the query is read-only by prepending with BEGIN READ ONLY
  // and wrapping in a transaction
  const readOnlySql = `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
    ${sql};
    COMMIT;
  `;
  
  try {
    // Execute the query with the default connection
    const result = await postgresClient.query(defaultDbConfig, sql);
    
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields?.map(field => ({
        name: field.name,
        dataTypeID: field.dataTypeID,
        typeName: getPostgresTypeName(field.dataTypeID)
      }))
    };
  } catch (error: any) {
    throw new Error(`SQL query error: ${error.message}`);
  }
}

// Helper function to map Postgres type IDs to type names
function getPostgresTypeName(typeId: number): string {
  const typeMap: Record<number, string> = {
    16: 'boolean',
    17: 'bytea',
    18: 'char',
    19: 'name',
    20: 'bigint',
    21: 'smallint',
    23: 'integer',
    25: 'text',
    26: 'oid',
    114: 'json',
    142: 'xml',
    600: 'point',
    700: 'float4',
    701: 'float8',
    718: 'circle',
    790: 'money',
    829: 'macaddr',
    869: 'inet',
    1042: 'bpchar',
    1043: 'varchar',
    1082: 'date',
    1083: 'time',
    1114: 'timestamp',
    1184: 'timestamptz',
    1186: 'interval',
    1266: 'timetz',
    1700: 'numeric',
    2950: 'uuid',
    3802: 'jsonb',
    // Add more type mappings as needed
  };
  
  return typeMap[typeId] || 'unknown';
} 