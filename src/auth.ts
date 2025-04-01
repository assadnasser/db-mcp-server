import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Define schema for API keys
export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  allowedIps: z.array(z.string()).optional()
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

// Environment variables will be used to configure JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a JWT token for authenticated access
 */
export const generateToken = (apiKey: ApiKey): string => {
  return jwt.sign({ id: apiKey.id, name: apiKey.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

/**
 * Verify a JWT token and extract payload
 */
export const verifyToken = (token: string): { id: string; name: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; name: string };
  } catch (error) {
    return null;
  }
};

/**
 * Express middleware to verify authentication
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip auth if disabled
  if (process.env.AUTH_DISABLED === 'true') {
    return next();
  }
  
  // Public routes that don't need authentication
  const publicPaths = ['/health', '/api/auth/token'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
  
  // Attach user info to request for use in route handlers
  (req as any).user = decoded;
  
  next();
};

/**
 * Controller for token generation
 */
export const generateTokenController = (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    
    // Validate API key
    // In a real app, you'd look this up from a database
    const apiKeyData: ApiKey = {
      id: apiKey || 'default-key',
      name: 'Default API Key'
    };
    
    // Generate token
    const token = generateToken(apiKeyData);
    
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
};

/**
 * Simple in-memory list of API keys for development
 * In production, store these in a database
 */
export const getApiKeys = (): ApiKey[] => {
  const defaultKey = process.env.DEFAULT_API_KEY || 'default-key';
  
  return [
    {
      id: defaultKey,
      name: 'Default API Key'
    }
  ];
}; 