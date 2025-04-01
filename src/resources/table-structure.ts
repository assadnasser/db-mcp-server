import { DbConfig, postgresClient } from '../database.js';

export async function getTableStructure(config: DbConfig, schema: string, table: string) {
  try {
    // Query table structure
    const result = await postgresClient.query(
      config,
      `
      SELECT 
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        CASE 
          WHEN a.attnotnull THEN 'NOT NULL'
          ELSE 'NULL'
        END AS nullable,
        CASE 
          WHEN (SELECT COUNT(*) FROM pg_catalog.pg_constraint c
                WHERE c.conrelid = a.attrelid 
                AND c.conkey[1] = a.attnum
                AND c.contype = 'p') > 0 THEN 'PK'
          ELSE ''
        END AS is_primary_key,
        CASE WHEN a.atthasdef THEN pg_get_expr(d.adbin, d.adrelid) ELSE NULL END AS default_value,
        col_description(a.attrelid, a.attnum) AS description
      FROM 
        pg_catalog.pg_attribute a
      LEFT JOIN 
        pg_catalog.pg_attrdef d ON (a.attrelid = d.adrelid AND a.attnum = d.adnum)
      JOIN 
        pg_catalog.pg_class c ON a.attrelid = c.oid
      JOIN 
        pg_catalog.pg_namespace n ON c.relnamespace = n.oid
      WHERE 
        a.attnum > 0
        AND NOT a.attisdropped
        AND c.relname = $1
        AND n.nspname = $2
      ORDER BY 
        a.attnum
      `,
      [table, schema]
    );

    // Also get foreign keys
    const fkResult = await postgresClient.query(
      config,
      `
      SELECT
        conname AS constraint_name,
        a.attname AS column_name,
        confrelid::regclass AS referenced_table,
        af.attname AS referenced_column
      FROM
        pg_constraint c
      JOIN
        pg_namespace n ON n.oid = c.connamespace
      JOIN
        pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      JOIN
        pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
      WHERE
        c.contype = 'f'
        AND n.nspname = $1
        AND conrelid::regclass::text = $2
      `,
      [schema, table]
    );

    // Get primary keys
    const pkResult = await postgresClient.query(
      config,
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
      [table, schema]
    );
    
    // Get indexes
    const indexResult = await postgresClient.query(
      config,
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
      [table, schema]
    );

    // Format the response
    return {
      schema,
      table,
      columns: result.rows,
      primaryKeys: pkResult.rows.map(row => row.column_name),
      foreignKeys: fkResult.rows,
      indexes: indexResult.rows
    };
  } catch (error) {
    throw new Error(`Error getting table structure: ${(error as Error).message}`);
  }
} 