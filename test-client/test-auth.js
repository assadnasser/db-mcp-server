const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-3685mle3a-duo-ai.vercel.app';

async function testMCPAuth() {
  console.log('Testing MCP Authentication on Vercel...');
  
  try {
    // Test auth endpoint if available
    console.log('\nTesting Auth endpoint:');
    try {
      const authResponse = await fetch(`${VERCEL_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'test_user',
          password: 'test_password'
        })
      });
      
      const authStatus = `Status: ${authResponse.status} ${authResponse.statusText}`;
      console.log(authStatus);
      
      // Check if the response is JSON
      const contentType = authResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const authData = await authResponse.json();
        console.log('Auth Response:', authData);
      } else {
        const textResponse = await authResponse.text();
        console.log('Response Text:', textResponse.substring(0, 200) + '...');
      }
    } catch (authError) {
      console.error('Error with Auth endpoint:', authError.message);
    }
  } catch (error) {
    console.error('Error testing MCP auth:', error.message);
  }
}

testMCPAuth(); 