import { VercelRequest, VercelResponse } from '@vercel/node';
import { activeTransports } from '../src/server.js';
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
}; 