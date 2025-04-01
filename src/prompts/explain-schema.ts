import { z } from 'zod';

// Schema for explain-schema prompt
export const explainSchemaSchema = {
  schemaJson: z.string(),
};

// Function to generate the prompt
export function explainSchemaPrompt(
  args: {
    schemaJson?: string;
  },
  extra: any
) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Explain the following database schema in simple terms:

\`\`\`json
${args?.schemaJson || ''}
\`\`\`

Please include:
1. The main tables and their purpose
2. Important relationships between tables
3. Any interesting design patterns you notice
`
      }
    }]
  };
} 