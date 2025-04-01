import { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/index.js';

export default async (req: VercelRequest, res: VercelResponse) => {
  // Forward to the Express app
  return app(req, res);
}; 