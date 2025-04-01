import { DbConfig } from './database.js';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

// Query history entry
export interface QueryHistoryEntry {
  id: string;
  dbConnectionId: string;
  userId?: string;
  query: string;
  params?: any[];
  rowCount?: number;
  executionTimeMs: number;
  timestamp: Date;
  error?: string;
}

/**
 * Interface for managing query history
 */
export interface QueryHistoryStore {
  recordQuery(entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>): Promise<QueryHistoryEntry>;
  getRecentQueries(dbConnectionId: string, limit?: number): Promise<QueryHistoryEntry[]>;
  getQueryById(id: string): Promise<QueryHistoryEntry | null>;
  clearHistory(dbConnectionId: string): Promise<void>;
}

/**
 * In-memory implementation of query history
 */
export class MemoryQueryHistoryStore implements QueryHistoryStore {
  private history: QueryHistoryEntry[] = [];
  
  async recordQuery(entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>): Promise<QueryHistoryEntry> {
    const newEntry: QueryHistoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date()
    };
    
    this.history.push(newEntry);
    
    // Keep history size reasonable
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }
    
    return newEntry;
  }
  
  async getRecentQueries(dbConnectionId: string, limit: number = 50): Promise<QueryHistoryEntry[]> {
    return this.history
      .filter(entry => entry.dbConnectionId === dbConnectionId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  async getQueryById(id: string): Promise<QueryHistoryEntry | null> {
    return this.history.find(entry => entry.id === id) || null;
  }
  
  async clearHistory(dbConnectionId: string): Promise<void> {
    this.history = this.history.filter(entry => entry.dbConnectionId !== dbConnectionId);
  }
}

/**
 * Redis implementation of query history
 */
export class RedisQueryHistoryStore implements QueryHistoryStore {
  private client: ReturnType<typeof createClient>;
  private prefix: string = 'mcp:query-history:';
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
  
  async recordQuery(entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>): Promise<QueryHistoryEntry> {
    try {
      await this.connect();
      
      const newEntry: QueryHistoryEntry = {
        ...entry,
        id: uuidv4(),
        timestamp: new Date()
      };
      
      // Store query in Redis
      await this.client.set(
        `${this.prefix}${newEntry.id}`,
        JSON.stringify(newEntry)
      );
      
      // Add to sorted set for this connection
      await this.client.zAdd(`${this.prefix}${newEntry.dbConnectionId}:list`, {
        score: newEntry.timestamp.getTime(),
        value: newEntry.id
      });
      
      return newEntry;
    } catch (error) {
      console.error('Redis record query error:', error);
      throw error;
    }
  }
  
  async getRecentQueries(dbConnectionId: string, limit: number = 50): Promise<QueryHistoryEntry[]> {
    try {
      await this.connect();
      
      // Get IDs from sorted set, ordered by timestamp (newest first)
      const queryIds = await this.client.zRange(
        `${this.prefix}${dbConnectionId}:list`,
        0,
        limit - 1,
        { REV: true }
      );
      
      if (!queryIds.length) {
        return [];
      }
      
      // Get each query entry
      const queries = await Promise.all(
        queryIds.map(async (id) => {
          const data = await this.client.get(`${this.prefix}${id}`);
          if (!data) return null;
          
          const entry = JSON.parse(data);
          // Convert timestamp string back to Date
          entry.timestamp = new Date(entry.timestamp);
          return entry;
        })
      );
      
      return queries.filter(query => query !== null) as QueryHistoryEntry[];
    } catch (error) {
      console.error('Redis get recent queries error:', error);
      return [];
    }
  }
  
  async getQueryById(id: string): Promise<QueryHistoryEntry | null> {
    try {
      await this.connect();
      
      const data = await this.client.get(`${this.prefix}${id}`);
      if (!data) return null;
      
      const entry = JSON.parse(data);
      // Convert timestamp string back to Date
      entry.timestamp = new Date(entry.timestamp);
      return entry;
    } catch (error) {
      console.error('Redis get query by ID error:', error);
      return null;
    }
  }
  
  async clearHistory(dbConnectionId: string): Promise<void> {
    try {
      await this.connect();
      
      // Get all query IDs for this connection
      const queryIds = await this.client.zRange(
        `${this.prefix}${dbConnectionId}:list`,
        0,
        -1
      );
      
      // Delete each query
      if (queryIds.length > 0) {
        await Promise.all(
          queryIds.map(id => this.client.del(`${this.prefix}${id}`))
        );
      }
      
      // Delete the list itself
      await this.client.del(`${this.prefix}${dbConnectionId}:list`);
    } catch (error) {
      console.error('Redis clear history error:', error);
    }
  }
}

// Helper function to get a connection ID from a DbConfig
export const getConnectionId = (config: DbConfig): string => {
  return `${config.user}@${config.host}:${config.port}/${config.database}`;
};

// Create query history store based on environment
export const createQueryHistoryStore = (): QueryHistoryStore => {
  if (process.env.REDIS_URL) {
    console.log('Using Redis query history store');
    return new RedisQueryHistoryStore();
  }
  
  console.log('Using in-memory query history store');
  return new MemoryQueryHistoryStore();
};

// Create and export singleton instance
export const queryHistoryStore = createQueryHistoryStore(); 