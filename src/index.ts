import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { createMcpServer, activeTransports } from './server.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { postgresClient } from './database.js';
import { createSessionStore } from './session.js';
import { authMiddleware, generateTokenController } from './auth.js';

// Import rate limiter and helmet once installed
let rateLimit = (options: any) => (req: any, res: any, next: any) => next();
let helmet = () => (req: any, res: any, next: any) => next();

try {
  // Try to import optional dependencies
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rateLimitLib = require('express-rate-limit');
  rateLimit = rateLimitLib.default || rateLimitLib;
  
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const helmetLib = require('helmet');
  helmet = helmetLib.default || helmetLib;
} catch (error) {
  console.warn('Optional dependencies not installed. Using fallbacks.');
}

// Load environment variables
config();

// Initialize server
const app = express();
const port = process.env.PORT || 3000;

// Create session store
const sessionStore = createSessionStore();

// Middleware
app.use(cors());
app.use(express.json());
app.use(helmet()); // Security middleware

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Authentication middleware
app.use(authMiddleware);

// Create MCP server
const mcpServer = createMcpServer();

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'OK', version: '1.0.0' });
});

// Authentication endpoints
app.post('/api/auth/token', generateTokenController);

// SSE endpoint
app.get('/sse', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Create a new transport for this connection
  const transport = new SSEServerTransport('/messages', res);
  const { sessionId } = transport;
  
  // Store in both active transports and session store
  activeTransports[sessionId] = transport;
  await sessionStore.saveSession(sessionId, transport);
  
  // Connect the transport to the MCP server
  try {
    await mcpServer.connect(transport);
    
    // Handle client disconnect
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
  
  // First check active transports in memory
  let transport = activeTransports[sessionId];
  
  // If not found in memory, try to get from session store
  if (!transport) {
    const storedTransport = await sessionStore.getSession(sessionId);
    
    if (storedTransport) {
      // Add back to active transports
      transport = storedTransport;
      activeTransports[sessionId] = storedTransport;
    } else {
      return res.status(404).json({ error: 'No active session found with the provided sessionId' });
    }
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Error handling message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Setup cleanup interval
setInterval(async () => {
  // 1 hour in milliseconds
  await sessionStore.cleanupSessions(60 * 60 * 1000);
  
  // Log current sessions count
  console.log(`Current active sessions: ${Object.keys(activeTransports).length}`);
}, 15 * 60 * 1000); // Run every 15 minutes

// Start the server when running directly (not imported in Vercel functions)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Handle server shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down server...');
  
  // Close all database connections
  await postgresClient.close();
  
  process.exit(0);
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// For Vercel serverless function compatibility
export default app; 