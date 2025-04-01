const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-6e0g4mtgd-duo-ai.vercel.app';

// Helper function to generate a unique session ID
function generateSessionId() {
  return `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

async function testMCPTools() {
  console.log('Testing MCP Tools Functionality...');
  const sessionId = generateSessionId();
  
  try {
    // Step 1: Establish an SSE connection (we can't directly test this here but we can verify it's available)
    console.log(`\n1. Checking SSE endpoint (session: ${sessionId})...`);
    const sseResponse = await fetch(`${VERCEL_URL}/sse?sessionId=${sessionId}`);
    console.log(`SSE endpoint status: ${sseResponse.status} ${sseResponse.statusText}`);
    
    // Step 2: Test tool execution - Database query
    console.log('\n2. Testing database query tool...');
    const dbQueryResponse = await fetch(`${VERCEL_URL}/messages?sessionId=${sessionId}`, {
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
        ]
      })
    });
    
    console.log(`Query response status: ${dbQueryResponse.status} ${dbQueryResponse.statusText}`);
    const dbQueryData = await dbQueryResponse.text();
    console.log('Response:', dbQueryData.substring(0, 500) + (dbQueryData.length > 500 ? '...' : ''));
    
    // Step 3: Try a different query
    console.log('\n3. Testing another database query...');
    const anotherQueryResponse = await fetch(`${VERCEL_URL}/messages?sessionId=${sessionId}`, {
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
              text: 'Describe the structure of a table'
            }
          }
        ]
      })
    });
    
    console.log(`Another query response status: ${anotherQueryResponse.status} ${anotherQueryResponse.statusText}`);
    const anotherQueryData = await anotherQueryResponse.text();
    console.log('Response:', anotherQueryData.substring(0, 500) + (anotherQueryData.length > 500 ? '...' : ''));
    
    // Step 4: Test the database connection directly
    console.log('\n4. Testing direct database connection...');
    const dbTestResponse = await fetch(`${VERCEL_URL}/test-db`);
    console.log(`DB test response status: ${dbTestResponse.status} ${dbTestResponse.statusText}`);
    
    try {
      const dbTestData = await dbTestResponse.json();
      console.log('DB Connection Test:', JSON.stringify(dbTestData, null, 2));
    } catch (e) {
      const dbTestText = await dbTestResponse.text();
      console.log('DB Test Response (text):', dbTestText.substring(0, 500) + (dbTestText.length > 500 ? '...' : ''));
    }
    
  } catch (error) {
    console.error('Error testing MCP tools:', error.message);
  }
}

testMCPTools(); 