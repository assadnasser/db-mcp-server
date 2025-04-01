import { DbConfig, postgresClient } from '../database.js';

export async function getDatabaseSchema(config: DbConfig) {
  try {
    // Query schema information
    const result = await postgresClient.query(
      config,
      `
      SELECT 
        n.nspname AS schema,
        c.relname AS name,
        CASE c.relkind 
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized view'
          WHEN 'i' THEN 'index'
          WHEN 'S' THEN 'sequence'
          WHEN 's' THEN 'special'
          WHEN 'f' THEN 'foreign table'
          WHEN 'p' THEN 'partitioned table'
        END AS type,
        pg_catalog.obj_description(c.oid, 'pg_class') AS description
      FROM 
        pg_catalog.pg_class c
      JOIN 
        pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE 
        c.relkind IN ('r', 'v', 'm', 'f', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY 
        schema, type, name
      `
    );

    const schemaInfo = result.rows.reduce((schemas: any, row) => {
      if (!schemas[row.schema]) {
        schemas[row.schema] = {
          tables: [],
          views: [],
          materializedViews: [],
          foreignTables: []
        };
      }

      if (row.type === 'table') {
        schemas[row.schema].tables.push(row.name);
      } else if (row.type === 'view') {
        schemas[row.schema].views.push(row.name);
      } else if (row.type === 'materialized view') {
        schemas[row.schema].materializedViews.push(row.name);
      } else if (row.type === 'foreign table') {
        schemas[row.schema].foreignTables.push(row.name);
      }

      return schemas;
    }, {});

    return schemaInfo;
  } catch (error) {
    throw new Error(`Error getting database schema: ${(error as Error).message}`);
  }
}

export function parseConnectionId(connectionId: string): DbConfig {
  try {
    // Format: user@host:port/database
    const [userPart, dbPart] = connectionId.split('@');
    const user = userPart;
    const [hostPort, database] = dbPart.split('/');
    const [host, portStr] = hostPort.split(':');
    const port = parseInt(portStr, 10);

    // Create config
    return {
      host,
      port,
      database,
      user,
      password: '' // Password needs to be provided in the actual tool calls
    };
  } catch (error) {
    throw new Error(`Invalid connection ID format: ${connectionId}. Expected format: user@host:port/database`);
  }
} 