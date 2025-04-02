import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { createMcpServer, activeTransports } from './server.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { postgresClient } from './database.js';
import { createSessionStore } from './session.js';
import { authMiddleware } from './auth.js';

// Load environment variables
config();

// Initialize server
const app = express();
const port = process.env.PORT || 3000;
const sessionStore = createSessionStore();
const mcpServer = createMcpServer();

// Middleware
app.use(cors());
app.use(express.json());
app.use(authMiddleware);

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'OK' });
});

// Debug endpoint to check active sessions
app.get('/debug/sessions', (_, res) => {
  res.json({ 
    activeSessions: Object.keys(activeTransports),
    count: Object.keys(activeTransports).length
  });
});

// SSE endpoint
app.get('/sse', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const transport = new SSEServerTransport('/messages', res);
  const { sessionId } = transport;
  
  console.log(`SSE connection established: ${sessionId}`);
  
  activeTransports[sessionId] = transport;
  await sessionStore.saveSession(sessionId, transport);
  
  try {
    await mcpServer.connect(transport);
    
    req.on('close', async () => {
      delete activeTransports[sessionId];
      await sessionStore.deleteSession(sessionId);
    });
  } catch (error) {
    console.error('Error connecting transport:', error);
    await sessionStore.deleteSession(sessionId);
    res.end();
  }
});

// Message endpoint for client-to-server communication
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId query parameter' });
  }
  
  let transport = activeTransports[sessionId];
  
  if (!transport) {
    transport = await sessionStore.getSession(sessionId);
    
    if (transport) {
      activeTransports[sessionId] = transport;
    } else {
      return res.status(404).json({ error: 'No active session found' });
    }
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
});

// Cleanup inactive sessions every 30 minutes
setInterval(() => {
  sessionStore.cleanupSessions(30 * 60 * 1000);
}, 30 * 60 * 1000);

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