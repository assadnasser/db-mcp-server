import { z } from 'zod';

// Schema for analyze-query prompt
export const analyzeQuerySchema = {
  query: z.string(),
  dbType: z.string().optional().default('postgresql'),
};

// Function to generate the prompt
export function analyzeQueryPrompt(
  args: {
    query?: string;
    dbType?: string;
  },
  extra: any
) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Analyze the following ${args?.dbType || 'postgresql'} SQL query:

\`\`\`sql
${args?.query || ''}
\`\`\`

Please explain:
1. What this query does
2. The tables and columns it uses
3. Any potential performance issues
4. Suggestions for optimization
`
      }
    }]
  };
} 