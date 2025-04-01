const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-3685mle3a-duo-ai.vercel.app';

async function testDatabaseConnection() {
  console.log('Testing MCP Database Connection on Vercel...');
  
  try {
    // Step 1: Create an SSE connection
    console.log('\n1. Creating SSE connection...');
    // We can't directly test SSE in this script, so we'll check if the endpoint is available
    const sseResponse = await fetch(`${VERCEL_URL}/sse`);
    console.log(`SSE endpoint status: ${sseResponse.status} ${sseResponse.statusText}`);
    
    // Step 2: Send a query through the messages endpoint
    console.log('\n2. Testing database query through MCP...');
    try {
      const mcpResponse = await fetch(`${VERCEL_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'List all tables in the database'
              }
            }
          ],
          // For some MCP implementations, you might need a session ID
          sessionId: 'test-session-123'
        })
      });
      
      // Check if the response is JSON
      const contentType = mcpResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const mcpData = await mcpResponse.json();
        console.log('MCP Response:', mcpData);
        
        // Check if we got a response that indicates database connectivity
        if (mcpData.error && mcpData.error.includes('database')) {
          console.log('⚠️ Database connection issue detected!');
        } else if (mcpData.tables || (mcpData.content && mcpData.content.includes('table'))) {
          console.log('✅ Database connection appears to be working!');
        } else {
          console.log('⚠️ Unable to determine database connectivity from response.');
        }
      } else {
        const textResponse = await mcpResponse.text();
        console.log(`Status: ${mcpResponse.status} ${mcpResponse.statusText}`);
        console.log('Response Text:', textResponse.substring(0, 200) + '...');
      }
    } catch (mcpError) {
      console.error('Error with MCP messages endpoint:', mcpError.message);
    }
    
  } catch (error) {
    console.error('Error testing database connection:', error.message);
  }
}

testDatabaseConnection(); 