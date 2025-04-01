import { VercelRequest, VercelResponse } from '@vercel/node';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer, activeTransports } from '../src/server.js';
import { createSessionStore } from '../src/session.js';
import { config } from 'dotenv';
import { verifyToken } from '../src/auth.js';

// Load environment variables
config();

// Create session store
const sessionStore = createSessionStore();

export default async (req: VercelRequest, res: VercelResponse) => {
  // Authentication check
  if (process.env.AUTH_DISABLED !== 'true') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    // Attach user info to request
    (req as any).user = decoded;
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Create MCP server
  const mcpServer = createMcpServer();
  
  // Create a new transport for this connection
  const transport = new SSEServerTransport('/api/messages', res);
  const { sessionId } = transport;
  
  // Store in both active transports and session store
  activeTransports[sessionId] = transport;
  await sessionStore.saveSession(sessionId, transport);
  
  try {
    // Connect the transport to the MCP server
    await mcpServer.connect(transport);
    
    // Handle client disconnect
    res.on('close', async () => {
      delete activeTransports[sessionId];
      await sessionStore.deleteSession(sessionId);
    });
  } catch (error) {
    console.error('Error connecting transport:', error);
    await sessionStore.deleteSession(sessionId);
    res.end();
  }
}; 