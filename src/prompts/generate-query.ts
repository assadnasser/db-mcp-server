import { z } from 'zod';

// Schema for generate-query prompt
export const generateQuerySchema = {
  description: z.string(),
  tables: z.string(), // String to fix compatibility issues
  dbType: z.string().optional().default('postgresql'),
};

// Function to generate the prompt
export function generateQueryPrompt(
  args: {
    description?: string;
    tables?: string;
    dbType?: string;
  }, 
  extra: any
) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Generate a ${args?.dbType || 'postgresql'} SQL query that ${args?.description || ''}. 
The query should involve the following tables: ${args?.tables || ''}.
Return only the SQL query without any explanations.`
      }
    }]
  };
} 