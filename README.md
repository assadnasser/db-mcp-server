# PostgreSQL MCP Server

A Model Context Protocol (MCP) server that allows users to connect to PostgreSQL databases. This server exposes resources, tools, and prompts for interacting with PostgreSQL databases through the MCP protocol.

## Overview

This MCP server allows external applications to share database credentials with the server via POST requests to an SSE (Server-Sent Events) endpoint. The server then establishes a connection to the specified PostgreSQL database and provides various ways to interact with it.

## Architecture

The server follows a modular architecture with clear separation of concerns:

- **Server Core** - Handles MCP protocol implementation and coordination
- **Resources** - Provide data and metadata about database entities
- **Tools** - Implement database operations and actions
- **Prompts** - Define natural language interface templates

The code is organized into these main directories:

```
src/
├── resources/   # Database schema, table structure, query history resources
├── tools/       # Database operations (queries, connections, table management)
├── prompts/     # Natural language templates for database operations
├── server.ts    # Main MCP server implementation and configuration
├── database.ts  # Database connection and query handling
└── query-history.ts # Query history tracking and storage
```

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
  - API rate limiting
  - CORS support and secure headers

- **Server Features**
  - Graceful shutdown handling
  - Cross-origin resource sharing (CORS) support

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/db-mcp-server.git
cd db-mcp-server

# Install dependencies
npm install

# Install TypeScript type definitions
npm install --save-dev @types/uuid @types/redis

# Create a .env file based on the example
cp .env.example .env
# Edit the .env file with your configuration
```

## Development

```bash
# Start the development server
npm run dev

# Build the project
npm run build
```

## Deployment to Vercel

The server is fully compatible with Vercel deployment:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel

# Deploy to production
vercel --prod
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment mode | development |
| REDIS_URL | Redis connection URL | none (uses in-memory storage) |
| PGHOST | PostgreSQL host | localhost |
| PGUSER | PostgreSQL user | postgres |
| PGDATABASE | PostgreSQL database | postgres |
| PGPASSWORD | PostgreSQL password | password |
| PGPORT | PostgreSQL port | 5432 |

## API Endpoints

- `GET /health`: Health check endpoint
- `GET /sse`: SSE endpoint for MCP communication
- `POST /messages`: Message endpoint for client-to-server communication

## Using the MCP Server

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

4. **postgres-schema**

   Gets schema information for one or all tables.
   
   URI template: `postgres://{host}/{table}/schema`

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

2. **query**

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
   - tables: string
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

## Storage Implementations

The server provides dual implementation for storage components:

### Query History

- **In-memory storage**: Used in development
- **Redis storage**: Used in production when REDIS_URL is provided

## Testing with MCP Inspector

You can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server:

```bash
# Install the MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Start the inspector
mcp-inspector --server-url http://localhost:3000
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 