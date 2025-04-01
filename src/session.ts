import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { activeTransports } from './server.js';

// Define interface for session data
export interface SessionData {
  transport: SSEServerTransport;
  created: Date;
  lastAccessed: Date;
}

/**
 * Session manager interface with methods for storing and retrieving sessions
 */
export interface SessionStore {
  saveSession(sessionId: string, transport: SSEServerTransport): Promise<void>;
  getSession(sessionId: string): Promise<SSEServerTransport | null>;
  deleteSession(sessionId: string): Promise<void>;
  cleanupSessions(maxAgeMs: number): Promise<void>;
}

/**
 * In-memory implementation of session store
 * Used as fallback when Redis is not available
 */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  
  async saveSession(sessionId: string, transport: SSEServerTransport): Promise<void> {
    this.sessions.set(sessionId, {
      transport,
      created: new Date(),
      lastAccessed: new Date()
    });
  }
  
  async getSession(sessionId: string): Promise<SSEServerTransport | null> {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData) return null;
    
    // Update last accessed time
    sessionData.lastAccessed = new Date();
    this.sessions.set(sessionId, sessionData);
    
    return sessionData.transport;
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
  
  async cleanupSessions(maxAgeMs: number): Promise<void> {
    const now = new Date();
    
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      const age = now.getTime() - sessionData.lastAccessed.getTime();
      if (age > maxAgeMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

/**
 * Redis implementation of session store
 * Used for production environments to ensure persistence across serverless function instances
 */
export class RedisSessionStore implements SessionStore {
  private client: ReturnType<typeof createClient>;
  private prefix: string = 'mcp:session:';
  private isConnected: boolean = false;
  
  constructor(redisUrl?: string) {
    this.client = createClient({
      url: redisUrl || process.env.REDIS_URL
    });
    
    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }
  
  private async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
    }
  }
  
  async saveSession(sessionId: string, transport: SSEServerTransport): Promise<void> {
    try {
      await this.connect();
      
      // We can't directly serialize the transport object with all its methods,
      // so we're storing a reference ID that will be used by the application code
      await this.client.set(
        `${this.prefix}${sessionId}`, 
        JSON.stringify({
          id: sessionId,
          created: new Date().toISOString(),
          lastAccessed: new Date().toISOString()
        }),
        { EX: 3600 } // 1 hour expiration
      );
      
      // Store the transport in the activeTransports map
      activeTransports[sessionId] = transport;
    } catch (error) {
      console.error('Redis save session error:', error);
      throw error;
    }
  }
  
  async getSession(sessionId: string): Promise<SSEServerTransport | null> {
    try {
      await this.connect();
      
      const data = await this.client.get(`${this.prefix}${sessionId}`);
      if (!data) return null;
      
      // Update last accessed time
      const sessionData = JSON.parse(data);
      sessionData.lastAccessed = new Date().toISOString();
      
      await this.client.set(
        `${this.prefix}${sessionId}`, 
        JSON.stringify(sessionData),
        { EX: 3600 } // 1 hour expiration
      );
      
      // Return the transport from the activeTransports map
      return activeTransports[sessionId] || null;
    } catch (error) {
      console.error('Redis get session error:', error);
      return null;
    }
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.connect();
      await this.client.del(`${this.prefix}${sessionId}`);
      
      // Remove from activeTransports map
      if (activeTransports[sessionId]) {
        delete activeTransports[sessionId];
      }
    } catch (error) {
      console.error('Redis delete session error:', error);
    }
  }
  
  async cleanupSessions(maxAgeMs: number): Promise<void> {
    // Redis handles expiration automatically via the EX parameter
    // But we should still clean up the activeTransports map
    try {
      await this.connect();
      
      // Get all session keys
      const keys = await this.client.keys(`${this.prefix}*`);
      
      // Clean up any transport objects that don't have corresponding Redis keys
      const validSessionIds = keys.map(key => key.replace(this.prefix, ''));
      
      for (const sessionId in activeTransports) {
        if (!validSessionIds.includes(sessionId)) {
          delete activeTransports[sessionId];
        }
      }
    } catch (error) {
      console.error('Redis cleanup sessions error:', error);
    }
  }
}

// Create session store based on environment
export const createSessionStore = (): SessionStore => {
  if (process.env.REDIS_URL) {
    console.log('Using Redis session store');
    return new RedisSessionStore();
  }
  
  console.log('Using in-memory session store');
  return new MemorySessionStore();
};

// Generate a unique session ID
export const generateSessionId = (): string => {
  return uuidv4();
}; 