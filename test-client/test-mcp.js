const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-3685mle3a-duo-ai.vercel.app';

async function testMCPServer() {
  console.log('Testing MCP Server on Vercel...');
  
  try {
    // Test basic endpoint
    console.log('\n1. Testing root endpoint:');
    const response = await fetch(`${VERCEL_URL}/`);
    const data = await response.json();
    console.log('Response:', data);
    
    // Test MCP messages endpoint
    console.log('\n2. Testing MCP messages endpoint:');
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
                text: 'Query the database for all tables'
              }
            }
          ]
        })
      });
      
      // Check if the response is JSON
      const contentType = mcpResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const mcpData = await mcpResponse.json();
        console.log('MCP Response:', mcpData);
      } else {
        const textResponse = await mcpResponse.text();
        console.log(`Status: ${mcpResponse.status} ${mcpResponse.statusText}`);
        console.log('Response Text:', textResponse);
      }
    } catch (mcpError) {
      console.error('Error with MCP messages endpoint:', mcpError.message);
    }
    
    // Test SSE endpoint if available
    console.log('\n3. Testing SSE endpoint:');
    try {
      const sseResponse = await fetch(`${VERCEL_URL}/sse`);
      const sseStatus = `Status: ${sseResponse.status} ${sseResponse.statusText}`;
      console.log(sseStatus);
      
      if (sseResponse.status === 200) {
        console.log('SSE endpoint is available');
      } else {
        const sseText = await sseResponse.text();
        console.log('SSE Response:', sseText.substring(0, 200) + '...');
      }
    } catch (sseError) {
      console.error('Error with SSE endpoint:', sseError.message);
    }
    
  } catch (error) {
    console.error('Error testing MCP server:', error.message);
  }
}

testMCPServer(); 