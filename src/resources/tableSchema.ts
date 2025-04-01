import { postgresClient } from '../database.js';
import { config } from 'dotenv';

// Load environment variables
config();

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
 * Fetches the schema information for a specific table
 * @param tableName The name of the table
 * @returns JSON schema information for the table
 */
export async function getTableSchema(tableName: string) {
  // Query to get column information
  const columnsQuery = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_identity,
      identity_generation,
      description
    FROM 
      information_schema.columns c
    LEFT JOIN 
      pg_description d ON 
        d.objoid = ('"' || c.table_schema || '"."' || c.table_name || '"')::regclass AND 
        d.objsubid = c.ordinal_position
    WHERE 
      table_name = $1
      AND table_schema = 'public'
    ORDER BY 
      ordinal_position;
  `;
  
  // Query to get primary key information
  const primaryKeyQuery = `
    SELECT 
      c.column_name
    FROM 
      information_schema.table_constraints tc
    JOIN 
      information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    JOIN 
      information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = ccu.column_name
    WHERE 
      tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = $1
      AND tc.table_schema = 'public';
  `;
  
  // Query to get foreign key information
  const foreignKeyQuery = `
    SELECT
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM
      information_schema.table_constraints AS tc
    JOIN
      information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
    JOIN
      information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
    WHERE 
      tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = $1
      AND tc.table_schema = 'public';
  `;
  
  // Query to get table information
  const tableInfoQuery = `
    SELECT 
      obj_description(('"' || table_schema || '"."' || table_name || '"')::regclass) as description
    FROM 
      information_schema.tables
    WHERE 
      table_name = $1
      AND table_schema = 'public';
  `;
  
  // Query to get index information
  const indexInfoQuery = `
    SELECT
      i.relname AS index_name,
      a.attname AS column_name,
      idx.indisunique AS is_unique,
      idx.indisprimary AS is_primary
    FROM
      pg_index idx
    JOIN
      pg_class i ON i.oid = idx.indexrelid
    JOIN
      pg_class t ON t.oid = idx.indrelid
    JOIN
      pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)
    WHERE
      t.relname = $1
    ORDER BY
      i.relname, a.attnum;
  `;
  
  try {
    // Execute all queries
    const [columnsResult, primaryKeyResult, foreignKeyResult, tableInfoResult, indexInfoResult] = await Promise.all([
      postgresClient.query(defaultDbConfig, columnsQuery, [tableName]),
      postgresClient.query(defaultDbConfig, primaryKeyQuery, [tableName]),
      postgresClient.query(defaultDbConfig, foreignKeyQuery, [tableName]),
      postgresClient.query(defaultDbConfig, tableInfoQuery, [tableName]),
      postgresClient.query(defaultDbConfig, indexInfoQuery, [tableName])
    ]);
    
    // Check if table exists
    if (columnsResult.rows.length === 0) {
      throw new Error(`Table '${tableName}' not found`);
    }
    
    // Process the columns
    const columns = columnsResult.rows.map(column => {
      const dataType = mapPostgresTypeToJsonSchemaType(column.data_type);
      
      return {
        name: column.column_name,
        type: dataType,
        nullable: column.is_nullable === 'YES',
        defaultValue: column.column_default,
        description: column.description,
        ...(column.character_maximum_length && { maxLength: column.character_maximum_length }),
        ...(column.numeric_precision && { precision: column.numeric_precision }),
        ...(column.numeric_scale && { scale: column.numeric_scale }),
        isIdentity: column.is_identity === 'YES',
        ...(column.identity_generation && { identityGeneration: column.identity_generation })
      };
    });
    
    // Process primary keys
    const primaryKeys = primaryKeyResult.rows.map(row => row.column_name);
    
    // Process foreign keys
    const foreignKeys = foreignKeyResult.rows.map(row => ({
      column: row.column_name,
      references: {
        table: row.foreign_table_name,
        column: row.foreign_column_name
      }
    }));
    
    // Process indexes
    const indexes = indexInfoResult.rows.reduce((acc, row) => {
      // Skip primary key indexes as they're already captured
      if (row.is_primary) {
        return acc;
      }
      
      // Group by index name
      const indexName = row.index_name;
      if (!acc[indexName]) {
        acc[indexName] = {
          name: indexName,
          columns: [],
          isUnique: row.is_unique
        };
      }
      
      acc[indexName].columns.push(row.column_name);
      return acc;
    }, {});
    
    // Build the schema response
    return {
      name: tableName,
      description: tableInfoResult.rows[0]?.description || null,
      columns,
      primaryKey: primaryKeys.length > 0 ? primaryKeys : null,
      foreignKeys: foreignKeys.length > 0 ? foreignKeys : null,
      indexes: Object.values(indexes),
      resource_path: `postgres://${defaultDbConfig.host}/${tableName}/schema`
    };
  } catch (error: any) {
    throw new Error(`Failed to get schema for table '${tableName}': ${error.message}`);
  }
}

/**
 * Lists all tables in the database with their schemas
 * @returns List of all tables with their schema information
 */
export async function listAllTableSchemas() {
  // Query to get all tables
  const tablesQuery = `
    SELECT 
      table_name 
    FROM 
      information_schema.tables 
    WHERE 
      table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY 
      table_name;
  `;
  
  try {
    // Get all table names
    const tablesResult = await postgresClient.query(defaultDbConfig, tablesQuery);
    
    // If no tables found
    if (tablesResult.rows.length === 0) {
      return { tables: [] };
    }
    
    // Get schema for each table
    const tableSchemas = await Promise.all(
      tablesResult.rows.map(async row => {
        try {
          return await getTableSchema(row.table_name);
        } catch (error) {
          // If we can't get schema for a specific table, return a minimal entry
          return { 
            name: row.table_name, 
            error: `Failed to fetch schema: ${(error as Error).message}`,
            resource_path: `postgres://${defaultDbConfig.host}/${row.table_name}/schema`
          };
        }
      })
    );
    
    return { 
      tables: tableSchemas,
      database: defaultDbConfig.database,
      host: defaultDbConfig.host,
      port: defaultDbConfig.port
    };
  } catch (error: any) {
    throw new Error(`Failed to list table schemas: ${error.message}`);
  }
}

/**
 * Maps PostgreSQL data types to JSON Schema types
 * @param postgresType The PostgreSQL data type
 * @returns The corresponding JSON Schema type
 */
function mapPostgresTypeToJsonSchemaType(postgresType: string): string {
  const typeMap: Record<string, string> = {
    'boolean': 'boolean',
    'smallint': 'integer',
    'integer': 'integer',
    'bigint': 'integer',
    'decimal': 'number',
    'numeric': 'number',
    'real': 'number',
    'double precision': 'number',
    'character varying': 'string',
    'varchar': 'string',
    'character': 'string',
    'char': 'string',
    'text': 'string',
    'date': 'string',
    'time': 'string',
    'timestamp': 'string',
    'timestamp with time zone': 'string',
    'timestamp without time zone': 'string',
    'interval': 'string',
    'json': 'object',
    'jsonb': 'object',
    'uuid': 'string',
    'bytea': 'string',
    'inet': 'string',
    'cidr': 'string',
    'macaddr': 'string',
    'point': 'string',
    'line': 'string',
    'lseg': 'string',
    'box': 'string',
    'path': 'string',
    'polygon': 'string',
    'circle': 'string',
    'xml': 'string',
    'money': 'string',
    'bit': 'string',
    'bit varying': 'string',
    'array': 'array'
  };
  
  return typeMap[postgresType.toLowerCase()] || 'string';
} 