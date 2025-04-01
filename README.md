# PostgreSQL MCP Server

A Model Context Protocol (MCP) server that allows users to connect to PostgreSQL databases. This server exposes resources, tools, and prompts for interacting with PostgreSQL databases through the MCP protocol.

## Overview

This MCP server allows external applications to share database credentials with the server via POST requests to an SSE (Server-Sent Events) endpoint. The server then establishes a connection to the specified PostgreSQL database and provides various ways to interact with it.

## Features

- **Database Connections**
  - Secure PostgreSQL connections with connection pooling
  - SSL support for encrypted connections
  - Connection validation

- **Query Execution**
  - SQL query execution with parameter binding
  - Query history tracking
  - Statistics collection

- **Schema Management**
  - Table listing and description
  - Column metadata with types, constraints, and descriptions
  - Primary key, foreign key, and index information

- **Database Analytics**
  - Database size information
  - Current database activity monitoring
  - Query performance tracking

- **Security**
  - JWT-based authentication
  - API rate limiting
  - CORS support and secure headers

- **Server Features**
  - Session management with persistent storage option (Redis)
  - Graceful shutdown handling
  - Cross-origin resource sharing (CORS) support

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/db-mcp-server.git
cd db-mcp-server

# Install dependencies
npm install

# Create a .env file based on the example
cp .env.example .env
# Edit the .env file with your configuration
```

## Development

```bash
# Start the development server
npm run dev
```

## Deployment to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment mode | development |
| JWT_SECRET | Secret for JWT tokens | your-secret-key-change-in-production |
| JWT_EXPIRES_IN | JWT token expiration | 7d |
| AUTH_DISABLED | Disable authentication | false |
| DEFAULT_API_KEY | Default API key | default-key |
| REDIS_URL | Redis connection URL | none (uses in-memory storage) |
| PGHOST | PostgreSQL host | localhost |
| PGUSER | PostgreSQL user | postgres |
| PGDATABASE | PostgreSQL database | postgres |
| PGPASSWORD | PostgreSQL password | password |
| PGPORT | PostgreSQL port | 5432 |
| SESSION_CLEANUP_INTERVAL_MS | Session cleanup interval | 900000 (15 minutes) |
| SESSION_MAX_AGE_MS | Session maximum age | 3600000 (1 hour) |

## API Endpoints

- `GET /health`: Health check endpoint
- `GET /sse`: SSE endpoint for MCP communication
- `POST /messages?sessionId=<sessionId>`: Message endpoint for client-to-server communication
- `POST /api/auth/token`: Endpoint to generate authentication tokens

## Using the MCP Server

### Authentication

To authenticate with the server, request a token:

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "default-key"}'
```

This will return a JWT token that you can use in subsequent requests:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### MCP Capabilities

This MCP server exposes the following capabilities:

#### Resources

1. **db-schema**
   
   Gets the database schema information.
   
   URI template: `schema://{connectionId}`

2. **table-structure**
   
   Gets the structure of a specific table.
   
   URI template: `table://{connectionId}/{schema}/{table}`

3. **query-history**
   
   Gets the history of executed queries.
   
   URI template: `history://{connectionId}`

#### Tools

1. **test-connection**

   Tests a connection to a PostgreSQL database.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)

2. **execute-query**

   Executes a SQL query on a PostgreSQL database.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)
   - query: string
   - params: any[] (optional)

3. **list-tables**

   Lists tables in a PostgreSQL database.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)

4. **describe-table**

   Describes the schema of a table in a PostgreSQL database.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)
   - tableName: string
   - schemaName: string (optional)

5. **get-database-stats**

   Gets statistics about a PostgreSQL database.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)

6. **get-query-history**

   Gets the history of executed queries.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)
   - limit: number (optional)

7. **clear-query-history**

   Clears the query history for a database connection.

   Parameters:
   - host: string
   - port: number
   - database: string
   - user: string
   - password: string
   - ssl: boolean (optional)

#### Prompts

1. **generate-query**

   Generates a SQL query based on a description.

   Parameters:
   - description: string
   - tables: string[]
   - dbType: string (optional, default: 'postgresql')

2. **analyze-query**

   Analyzes a SQL query for performance and issues.

   Parameters:
   - query: string
   - dbType: string (optional, default: 'postgresql')

3. **explain-schema**

   Explains a database schema in natural language.

   Parameters:
   - schemaJson: string

## Example Client Code

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { HttpClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

// Create a client
const transport = new HttpClientTransport({
  baseUrl: 'https://your-vercel-deployment.vercel.app',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

const client = new Client(
  {
    name: 'example-client',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

// Connect to the server
await client.connect(transport);

// Call a tool
const result = await client.callTool({
  name: 'test-connection',
  arguments: {
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'password'
  }
});

console.log(result);

// Read a resource
const schema = await client.readResource('schema://postgres@localhost:5432/postgres');
console.log(schema);

// Use a prompt
const queryPrompt = await client.getPrompt('generate-query', {
  description: 'find all users who registered in the last 30 days',
  tables: ['users', 'user_profiles']
});

console.log(queryPrompt);
```

## Testing with MCP Inspector

You can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server:

```bash
# Install the MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Start the inspector
mcp-inspector --server-url http://localhost:3000
```

## License

MIT 