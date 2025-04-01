import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { DbConfigSchema, DbConfig } from './database.js';
import { queryHistoryStore, getConnectionId } from './query-history.js';
import { 
  testConnection, testConnectionSchema,
  listTables, listTablesSchema,
  describeTable, describeTableSchema,
  getDatabaseStats, getDatabaseStatsSchema,
  getQueryHistory, getQueryHistorySchema,
  clearQueryHistory, clearQueryHistorySchema,
  query, querySchema
} from './tools/index.js';
import { 
  getDatabaseSchema,
  getTableStructure,
  getQueryHistory as getQueryHistoryResource,
  getTableSchema,
  listAllTableSchemas,
  parseConnectionId
} from './resources/index.js';
import {
  generateQuerySchema, generateQueryPrompt,
  analyzeQuerySchema, analyzeQueryPrompt,
  explainSchemaSchema, explainSchemaPrompt
} from './prompts/index.js';

// Define session store type
export interface TransportStore {
  [sessionId: string]: SSEServerTransport;
}

// Helper function to adapt tool functions to the McpServer tool interface
function adaptToolFunction(toolFn: Function) {
  return async (args: any, extra: any) => {
    try {
      return await toolFn(args);
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  };
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
        // Parse connection ID and get a config
        const connectionId = params.connectionId as string;
        const config = parseConnectionId(connectionId);
        
        // Get the database schema
        const schemaInfo = await getDatabaseSchema(config);

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
        // Parse connection ID and get config
        const connectionId = params.connectionId as string;
        const schema = params.schema as string;
        const table = params.table as string;
        
        const config = parseConnectionId(connectionId);

        // Get the table structure
        const tableInfo = await getTableStructure(config, schema, table);

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
        const history = await getQueryHistoryResource(connectionId);
        
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
    testConnectionSchema.shape,
    adaptToolFunction(testConnection)
  );

  // Tool to list tables in a database
  server.tool(
    'list-tables',
    listTablesSchema.shape,
    adaptToolFunction(listTables)
  );

  // Tool to describe a table
  server.tool(
    'describe-table',
    describeTableSchema.shape,
    adaptToolFunction(describeTable)
  );

  // Tool to get database stats
  server.tool(
    'get-database-stats',
    getDatabaseStatsSchema.shape,
    adaptToolFunction(getDatabaseStats)
  );

  // Tool to get query history
  server.tool(
    'get-query-history',
    getQueryHistorySchema.shape,
    adaptToolFunction(getQueryHistory)
  );

  // Tool to clear query history
  server.tool(
    'clear-query-history',
    clearQueryHistorySchema.shape,
    adaptToolFunction(clearQueryHistory)
  );

  // Register the query tool
  server.tool(
    'query',
    querySchema.shape,
    adaptToolFunction(query)
  );
  
  // Register resource for table schemas
  server.resource(
    'postgres-schema',
    new ResourceTemplate('postgres://{host}/{table}/schema', { list: undefined }),
    async (uri, params) => {
      try {
        const tableName = params.table as string;
        
        // If no specific table is requested, list all tables
        if (tableName === '*' || tableName === '') {
          const allSchemas = await listAllTableSchemas();
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(allSchemas, null, 2)
            }]
          };
        }
        
        // Otherwise, get schema for the specified table
        const tableSchema = await getTableSchema(tableName);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(tableSchema, null, 2)
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

  // ======== PROMPTS ========

  // Prompt to generate SQL queries
  server.prompt(
    'generate-query',
    generateQuerySchema,
    generateQueryPrompt
  );

  // Prompt to analyze a query
  server.prompt(
    'analyze-query',
    analyzeQuerySchema,
    analyzeQueryPrompt
  );

  // Prompt to explain database schema
  server.prompt(
    'explain-schema',
    explainSchemaSchema,
    explainSchemaPrompt
  );

  return server;
};

// Map to store active connections
export const activeTransports: TransportStore = {}; 