import { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from 'dotenv';
import { Client } from 'pg';

// Load environment variables
config();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const client = new Client({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
  });

  try {
    // Connect to the database
    await client.connect();
    
    // Test query to list all tables
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const result = await client.query(query);
    
    // Return the tables
    res.status(200).json({
      success: true,
      message: 'Database connection successful',
      tables: result.rows.map(row => row.table_name),
      env: {
        host: process.env.PGHOST ? '✓ Set' : '✗ Missing',
        user: process.env.PGUSER ? '✓ Set' : '✗ Missing',
        database: process.env.PGDATABASE ? '✓ Set' : '✗ Missing',
        password: process.env.PGPASSWORD ? '✓ Set' : '✗ Missing',
        port: process.env.PGPORT ? '✓ Set' : '✗ Missing'
      }
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      env: {
        host: process.env.PGHOST ? '✓ Set' : '✗ Missing',
        user: process.env.PGUSER ? '✓ Set' : '✗ Missing',
        database: process.env.PGDATABASE ? '✓ Set' : '✗ Missing',
        password: process.env.PGPASSWORD ? '✓ Set' : '✗ Missing',
        port: process.env.PGPORT ? '✓ Set' : '✗ Missing'
      }
    });
  } finally {
    // Close the connection
    await client.end();
  }
} 