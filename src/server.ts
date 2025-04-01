import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { DbConfigSchema, postgresClient, DbConfig } from './database.js';
import { queryHistoryStore, getConnectionId } from './query-history.js';

// Define session store type
export interface TransportStore {
  [sessionId: string]: SSEServerTransport;
}

// Create the MCP server instance
export const createMcpServer = () => {
  const server = new McpServer({
    name: 'PostgreSQL MCP Server',
    version: '1.0.0'
  });

  // ======== RESOURCES ========

  // Resource to get database schema
  server.resource(
    'db-schema',
    new ResourceTemplate('schema://{connectionId}', { list: undefined }),
    async (uri, params) => {
      try {
        // Extract connection info from the connection ID
        // Format: user@host:port/database
        const connectionId = params.connectionId as string;
        const [userPart, dbPart] = connectionId.split('@');
        const user = userPart;
        const [hostPort, database] = dbPart.split('/');
        const [host, portStr] = hostPort.split(':');
        const port = parseInt(portStr, 10);

        // Create config
        const config: DbConfig = {
          host,
          port,
          database,
          user,
          password: '' // Password needs to be provided in the actual tool calls
        };

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

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(schemaInfo, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error getting schema: ${(error as Error).message}`
          }]
        };
      }
    }
  );

  // Resource to get table structure
  server.resource(
    'table-structure',
    new ResourceTemplate('table://{connectionId}/{schema}/{table}', { list: undefined }),
    async (uri, params) => {
      try {
        // Extract connection info from the connection ID (same as above)
        const connectionId = params.connectionId as string;
        const schema = params.schema as string;
        const table = params.table as string;
        
        const [userPart, dbPart] = connectionId.split('@');
        const user = userPart;
        const [hostPort, database] = dbPart.split('/');
        const [host, portStr] = hostPort.split(':');
        const port = parseInt(portStr, 10);

        const config: DbConfig = {
          host,
          port,
          database,
          user,
          password: '' // Password needs to be provided in the actual tool calls
        };

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

        // Format the response
        const tableInfo = {
          schema,
          table,
          columns: result.rows,
          foreignKeys: fkResult.rows
        };

        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(tableInfo, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error getting table structure: ${(error as Error).message}`
          }]
        };
      }
    }
  );

  // Resource to get query history
  server.resource(
    'query-history',
    new ResourceTemplate('history://{connectionId}', { list: undefined }),
    async (uri, params) => {
      try {
        const connectionId = params.connectionId as string;
        const history = await queryHistoryStore.getRecentQueries(connectionId);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(history, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error getting query history: ${(error as Error).message}`
          }]
        };
      }
    }
  );

  // ======== TOOLS ========

  // Tool to test database connection
  server.tool(
    'test-connection',
    DbConfigSchema.shape,
    async (config: DbConfig) => {
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
  );

  // Tool to execute SQL queries
  server.tool(
    'execute-query',
    {
      ...DbConfigSchema.shape,
      query: z.string(),
      params: z.array(z.any()).optional()
    },
    async ({ query, params, ...dbConfig }) => {
      try {
        const startTime = Date.now();
        const result = await postgresClient.query(dbConfig as DbConfig, query, params || []);
        const executionTime = Date.now() - startTime;
        
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              rowCount: result.rowCount,
              rows: result.rows,
              fields: result.fields.map(f => ({
                name: f.name,
                dataTypeID: f.dataTypeID
              })),
              executionTimeMs: executionTime
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Query execution failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  // Tool to list tables in a database
  server.tool(
    'list-tables',
    DbConfigSchema.shape,
    async (dbConfig: DbConfig) => {
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
  );

  // Tool to describe a table
  server.tool(
    'describe-table',
    {
      ...DbConfigSchema.shape,
      tableName: z.string(),
      schemaName: z.string().optional()
    },
    async ({ tableName, schemaName, ...dbConfig }) => {
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
  );

  // Tool to get database stats
  server.tool(
    'get-database-stats',
    DbConfigSchema.shape,
    async (dbConfig: DbConfig) => {
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
  );

  // Tool to get query history
  server.tool(
    'get-query-history',
    {
      ...DbConfigSchema.shape,
      limit: z.number().optional()
    },
    async ({ limit, ...dbConfig }) => {
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
  );

  // Tool to clear query history
  server.tool(
    'clear-query-history',
    DbConfigSchema.shape,
    async (dbConfig: DbConfig) => {
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
  );

  // ======== PROMPTS ========

  // Prompt to generate SQL queries
  server.prompt(
    'generate-query',
    {
      description: z.string(),
      tables: z.array(z.string()),
      dbType: z.string().optional().default('postgresql'),
    },
    (args) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a ${args.dbType} SQL query that ${args.description}. 
The query should involve the following tables: ${args.tables.join(', ')}.
Return only the SQL query without any explanations.`
        }
      }]
    })
  );

  // Prompt to analyze a query
  server.prompt(
    'analyze-query',
    {
      query: z.string(),
      dbType: z.string().optional().default('postgresql'),
    },
    (args) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze the following ${args.dbType} SQL query:

\`\`\`sql
${args.query}
\`\`\`

Please explain:
1. What this query does
2. The tables and columns it uses
3. Any potential performance issues
4. Suggestions for optimization
`
        }
      }]
    })
  );

  // Prompt to explain database schema
  server.prompt(
    'explain-schema',
    { 
      schemaJson: z.string(),
    },
    (args) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Explain the following database schema in simple terms:

\`\`\`json
${args.schemaJson}
\`\`\`

Please include:
1. The main tables and their purpose
2. Important relationships between tables
3. Any interesting design patterns you notice
`
        }
      }]
    })
  );

  return server;
};

// Map to store active connections
export const activeTransports: TransportStore = {}; 