import { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Forward to the Express app with the specific path
    return app(req, res);
  } catch (error) {
    console.error('Error handling messages request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
} 