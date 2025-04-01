import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateTokenController } from '../../src/auth.js';
import { config } from 'dotenv';

// Load environment variables
config();

export default async (req: VercelRequest, res: VercelResponse) => {
  // Forward to the controller
  return generateTokenController(req, res);
}; 