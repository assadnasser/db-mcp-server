import pg from 'pg';
import { z } from 'zod';
import { queryHistoryStore, getConnectionId } from './query-history.js';

// Define the schema for database connection configuration
export const DbConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().optional()
});

export type DbConfig = z.infer<typeof DbConfigSchema>;

// Database statistics interface
export interface DbStats {
  connectionId: string;
  totalQueries: number;
  avgExecutionTimeMs: number;
  slowestQuery?: {
    query: string;
    executionTimeMs: number;
  };
  lastQueryTimestamp?: Date;
}

// Class to manage PostgreSQL connections
export class PostgresClient {
  private clients: Map<string, pg.Pool> = new Map();
  private stats: Map<string, DbStats> = new Map();
  
  // Generate a unique key for a connection
  private getConnectionKey(config: DbConfig): string {
    return getConnectionId(config);
  }
  
  // Get or create a connection pool
  async getConnection(config: DbConfig): Promise<pg.Pool> {
    const key = this.getConnectionKey(config);
    
    if (!this.clients.has(key)) {
      const pool = new pg.Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined
      });
      
      // Initialize stats for this connection
      this.stats.set(key, {
        connectionId: key,
        totalQueries: 0,
        avgExecutionTimeMs: 0
      });
      
      // Test the connection
      try {
        const client = await pool.connect();
        client.release();
        this.clients.set(key, pool);
      } catch (error) {
        throw new Error(`Failed to connect to database: ${(error as Error).message}`);
      }
    }
    
    return this.clients.get(key)!;
  }
  
  // Execute a query using the specified connection
  async query(config: DbConfig, query: string, params: any[] = []): Promise<pg.QueryResult> {
    const key = this.getConnectionKey(config);
    const pool = await this.getConnection(config);
    
    // Track execution time
    const startTime = Date.now();
    let error: Error | undefined;
    let result: pg.QueryResult | undefined;
    
    try {
      result = await pool.query(query, params);
      return result;
    } catch (err) {
      error = err as Error;
      throw error;
    } finally {
      const executionTimeMs = Date.now() - startTime;
      
      // Update stats
      const stats = this.stats.get(key) || {
        connectionId: key,
        totalQueries: 0,
        avgExecutionTimeMs: 0
      };
      
      const totalExecutionTime = stats.avgExecutionTimeMs * stats.totalQueries;
      stats.totalQueries++;
      stats.avgExecutionTimeMs = (totalExecutionTime + executionTimeMs) / stats.totalQueries;
      stats.lastQueryTimestamp = new Date();
      
      // Track slowest query
      if (!stats.slowestQuery || executionTimeMs > stats.slowestQuery.executionTimeMs) {
        stats.slowestQuery = {
          query,
          executionTimeMs
        };
      }
      
      this.stats.set(key, stats);
      
      // Record in query history
      if (result || error) {
        await queryHistoryStore.recordQuery({
          dbConnectionId: key,
          query,
          params,
          rowCount: result ? result.rowCount : undefined,
          executionTimeMs,
          error: error?.message
        });
      }
    }
  }
  
  // Get statistics for a database connection
  getStats(config: DbConfig): DbStats | null {
    const key = this.getConnectionKey(config);
    return this.stats.get(key) || null;
  }
  
  // Get all available database statistics
  getAllStats(): DbStats[] {
    return Array.from(this.stats.values());
  }
  
  // Close all connections
  async close(): Promise<void> {
    const pools = Array.from(this.clients.values());
    await Promise.all(pools.map(pool => pool.end()));
    this.clients.clear();
    this.stats.clear();
  }
  
  // Get database size information
  async getDatabaseSize(config: DbConfig): Promise<{ dbName: string; sizeBytes: number; tableSizes: { tableName: string; sizeBytes: number }[] }> {
    const result = await this.query(
      config,
      `
      SELECT
        pg_database.datname AS db_name,
        pg_database_size(pg_database.datname) AS db_size,
        (
          SELECT json_agg(json_build_object(
            'tableName', t.tablename,
            'sizeBytes', pg_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename))
          ))
          FROM pg_tables t
          WHERE t.schemaname NOT IN ('pg_catalog', 'information_schema')
        ) AS table_sizes
      FROM pg_database
      WHERE pg_database.datname = $1
      `,
      [config.database]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Database ${config.database} not found`);
    }
    
    const row = result.rows[0];
    return {
      dbName: row.db_name,
      sizeBytes: row.db_size,
      tableSizes: row.table_sizes || []
    };
  }
  
  // Get database activity
  async getDatabaseActivity(config: DbConfig): Promise<any[]> {
    try {
      const result = await this.query(
        config,
        `
        SELECT 
          pid,
          usename AS username,
          application_name,
          client_addr AS client_address,
          query_start,
          state,
          substr(query, 1, 100) AS query_preview
        FROM 
          pg_stat_activity
        WHERE 
          state IS NOT NULL
          AND pid <> pg_backend_pid()
        ORDER BY 
          query_start DESC
        `
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error getting database activity:', error);
      return [];
    }
  }
}

// Export a singleton instance
export const postgresClient = new PostgresClient(); 