import { z } from 'zod';
import { DbConfigSchema, DbConfig, postgresClient } from '../database.js';

export const describeTableSchema = z.object({
  ...DbConfigSchema.shape,
  tableName: z.string(),
  schemaName: z.string().optional()
});

export type DescribeTableParams = {
  tableName: string;
  schemaName?: string;
} & DbConfig;

export async function describeTable({ tableName, schemaName, ...dbConfig }: DescribeTableParams) {
  try {
    const schema = schemaName || 'public';
    const result = await postgresClient.query(
      dbConfig as DbConfig,
      `
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default,
        (
          SELECT
            pg_catalog.col_description(c.oid, a.attnum)
          FROM
            pg_catalog.pg_class c
          JOIN
            pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          JOIN
            pg_catalog.pg_attribute a ON a.attrelid = c.oid
          WHERE
            n.nspname = $2
            AND c.relname = $1
            AND a.attname = columns.column_name
            AND NOT a.attisdropped
        ) as column_description
      FROM 
        information_schema.columns
      WHERE 
        table_name = $1 
        AND table_schema = $2
      ORDER BY 
        ordinal_position
      `,
      [tableName, schema]
    );
    
    // Also get primary keys
    const pkResult = await postgresClient.query(
      dbConfig as DbConfig,
      `
      SELECT
        kcu.column_name
      FROM
        information_schema.table_constraints tc
      JOIN
        information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE
        tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
      `,
      [tableName, schema]
    );
    
    // Get foreign keys
    const fkResult = await postgresClient.query(
      dbConfig as DbConfig,
      `
      SELECT
        kcu.column_name,
        ccu.table_schema AS referenced_table_schema,
        ccu.table_name AS referenced_table_name,
        ccu.column_name AS referenced_column_name
      FROM
        information_schema.table_constraints tc
      JOIN
        information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN
        information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
      `,
      [tableName, schema]
    );
    
    // Get indexes
    const indexResult = await postgresClient.query(
      dbConfig as DbConfig,
      `
      SELECT
        i.relname AS index_name,
        a.attname AS column_name,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM
        pg_class t
      JOIN
        pg_index ix ON t.oid = ix.indrelid
      JOIN
        pg_class i ON i.oid = ix.indexrelid
      JOIN
        pg_attribute a ON a.attrelid = t.oid
      JOIN
        pg_namespace n ON n.oid = t.relnamespace
      WHERE
        t.relkind = 'r'
        AND a.attnum = ANY(ix.indkey)
        AND t.relname = $1
        AND n.nspname = $2
      ORDER BY
        i.relname, a.attnum
      `,
      [tableName, schema]
    );
    
    // Enhanced response
    const response = {
      table: {
        name: tableName,
        schema: schema,
      },
      columns: result.rows,
      primaryKeys: pkResult.rows.map(row => row.column_name),
      foreignKeys: fkResult.rows,
      indexes: indexResult.rows
    };
    
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Failed to describe table: ${(error as Error).message}` }],
      isError: true
    };
  }
} 