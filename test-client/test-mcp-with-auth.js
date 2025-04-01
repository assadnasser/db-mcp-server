const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-6e0g4mtgd-duo-ai.vercel.app';

// Helper function to generate a unique session ID
function generateSessionId() {
  return `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

async function testMCPWithAuth() {
  console.log('Testing MCP with Authentication...');
  const sessionId = generateSessionId();
  let authToken = null;
  
  try {
    // Step 1: Get an authentication token
    console.log('\n1. Getting authentication token...');
    
    // For this test, we'll use the default API key specified in your environment
    // You might need to adjust this if you have a different authentication method
    const defaultApiKey = 'default-key'; // This should match your DEFAULT_API_KEY env var
    
    const authResponse = await fetch(`${VERCEL_URL}/api/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${defaultApiKey}`
      },
      body: JSON.stringify({
        username: 'test-user'
      })
    });
    
    console.log(`Auth response status: ${authResponse.status} ${authResponse.statusText}`);
    
    // Parse the authentication response
    try {
      const authData = await authResponse.json();
      console.log('Auth response:', authData);
      
      if (authData.token) {
        authToken = authData.token;
        console.log('✅ Successfully obtained auth token');
      } else {
        console.log('❌ Failed to obtain auth token');
      }
    } catch (e) {
      const authResponseText = await authResponse.text();
      console.log('Auth response (text):', authResponseText);
    }
    
    // If we didn't get a token, try using the /test-db endpoint with AUTH_DISABLED
    if (!authToken) {
      console.log('\nTrying to access test-db endpoint without authentication...');
      console.log('(This will work if AUTH_DISABLED=true is set in your environment)');
      
      const testDbResponse = await fetch(`${VERCEL_URL}/test-db`);
      console.log(`Test DB response status: ${testDbResponse.status} ${testDbResponse.statusText}`);
      
      try {
        const testDbData = await testDbResponse.json();
        console.log('Test DB response:', testDbData);
      } catch (e) {
        const testDbText = await testDbResponse.text();
        console.log('Test DB response (text):', testDbText.substring(0, 500));
      }
      
      console.log('\nRecommendation: Set AUTH_DISABLED=true in your Vercel environment variables for testing');
      return;
    }
    
    // Step 2: Test the MCP with authentication
    console.log('\n2. Testing MCP with authentication token...');
    
    const mcpResponse = await fetch(`${VERCEL_URL}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
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
        ]
      })
    });
    
    console.log(`MCP response status: ${mcpResponse.status} ${mcpResponse.statusText}`);
    
    try {
      const mcpData = await mcpResponse.json();
      console.log('MCP response:', mcpData);
    } catch (e) {
      const mcpText = await mcpResponse.text();
      console.log('MCP response (text):', mcpText.substring(0, 500));
    }
    
  } catch (error) {
    console.error('Error testing MCP with auth:', error.message);
  }
}

testMCPWithAuth(); 