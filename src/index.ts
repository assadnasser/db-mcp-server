import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { postgresClient } from './database.js';
import { createMcpServer } from './server.js';

// Load environment variables
config();

// Initialize MCP server
const mcpServer = createMcpServer();

// Global transport variable - no more session management
let transport: SSEServerTransport | null = null;

// Initialize server
const app = express();
const port = process.env.PORT || 3000;


// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'OK' });
});

// SSE endpoint
app.get('/sse', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Create a new transport for this connection
  transport = new SSEServerTransport('/messages', res);
  
  console.log('SSE connection established');
  
  try {
    await mcpServer.connect(transport);
    
    req.on('close', () => {
      console.log('SSE connection closed');
      transport = null;
    });
  } catch (error) {
    console.error('Error connecting transport:', error);
    transport = null;
    res.end();
  }
});

// Message endpoint for client-to-server communication
app.post('/messages', async (req, res) => {
  if (!transport) {
    return res.status(503).json({ error: 'No active SSE connection' });
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Error handling message:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
});

// Start the server
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Handle shutdown
process.on('SIGTERM', async () => {
  await postgresClient.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await postgresClient.close();
  process.exit(0);
});

export default app; 