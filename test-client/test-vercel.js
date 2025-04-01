const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-3685mle3a-duo-ai.vercel.app';

async function testMCPServer() {
  console.log('Testing MCP Server on Vercel...');
  
  try {
    // Test basic endpoint
    const response = await fetch(`${VERCEL_URL}/`);
    const data = await response.json();
    console.log('Response from root endpoint:', data);
    
    // You could add more tests for specific MCP endpoints
    // For example:
    // const mcpResponse = await fetch(`${VERCEL_URL}/messages`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     messages: [
    //       {
    //         role: 'user',
    //         content: {
    //           type: 'text',
    //           text: 'Query the database'
    //         }
    //       }
    //     ]
    //   })
    // });
    // const mcpData = await mcpResponse.json();
    // console.log('MCP Response:', mcpData);
    
  } catch (error) {
    console.error('Error testing MCP server:', error.message);
    if (error.response) {
      const errorText = await error.response.text();
      console.error('Error details:', errorText);
    }
  }
}

testMCPServer(); 