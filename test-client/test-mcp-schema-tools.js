const fetch = require('node-fetch');

// Your Vercel deployment URL
const VERCEL_URL = 'https://db-mcp-server-6e0g4mtgd-duo-ai.vercel.app';

// Helper function to generate a unique session ID
function generateSessionId() {
  return `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

// Helper for authenticated requests if needed
async function getAuthToken(apiKey = 'default-key') {
  const response = await fetch(`${VERCEL_URL}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `ApiKey ${apiKey}`
    },
    body: JSON.stringify({
      username: 'test-user'
    })
  });
  
  const data = await response.json();
  return data.token || null;
}

async function testMCPSchemaAndTools() {
  console.log('Testing MCP Schema Resources and Query Tool...');
  const sessionId = generateSessionId();
  
  try {
    // Step 1: Get an auth token if needed
    console.log('\n1. Acquiring authorization token...');
    const authToken = await getAuthToken();
    
    if (authToken) {
      console.log('✅ Successfully obtained auth token');
    } else {
      console.log('❌ Failed to get auth token, proceeding without authentication');
    }
    
    const authHeader = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
    
    // Step 2: Test the test-db endpoint to check database connection
    console.log('\n2. Testing database connection...');
    const dbTestResponse = await fetch(`${VERCEL_URL}/test-db-noauth`, {
      headers: authHeader
    });
    
    console.log(`DB connection test status: ${dbTestResponse.status} ${dbTestResponse.statusText}`);
    
    try {
      const dbTestData = await dbTestResponse.json();
      console.log('Database connection test:', dbTestData);
      if (dbTestData.success) {
        console.log('✅ Database connection working');
        console.log('   Tables available:', dbTestData.tables.join(', '));
      } else {
        console.log('❌ Database connection failed:', dbTestData.message);
        console.log('   Environment variables set:', dbTestData.env);
      }
    } catch (e) {
      console.log('Could not parse DB test response as JSON');
    }
    
    // Step 3: List all tables using the schema resource (simulating MCP resource access)
    console.log('\n3. Testing table schema resource (listing all tables)...');
    const schemaResponse = await fetch(`${VERCEL_URL}/api/resource?path=postgres://localhost/*/schema`, {
      headers: {
        ...authHeader
      }
    });
    
    console.log(`Schema resource status: ${schemaResponse.status} ${schemaResponse.statusText}`);
    
    try {
      const schemaData = await schemaResponse.json();
      console.log('Schema resource response:', JSON.stringify(schemaData, null, 2).substring(0, 300) + '...');
    } catch (e) {
      console.log('Could not parse schema response as JSON');
    }
    
    // Step 4: Get schema for a specific table (if we know any table names)
    console.log('\n4. Testing table schema resource for a specific table...');
    // Replace 'users' with an actual table name from your database
    const tableSchemaResponse = await fetch(`${VERCEL_URL}/api/resource?path=postgres://localhost/users/schema`, {
      headers: {
        ...authHeader
      }
    });
    
    console.log(`Table schema status: ${tableSchemaResponse.status} ${tableSchemaResponse.statusText}`);
    
    try {
      const tableSchemaData = await tableSchemaResponse.json();
      console.log('Table schema response:', JSON.stringify(tableSchemaData, null, 2).substring(0, 300) + '...');
    } catch (e) {
      console.log('Could not parse table schema response as JSON');
    }
    
    // Step 5: Execute a query using the query tool
    console.log('\n5. Testing query tool...');
    const queryResponse = await fetch(`${VERCEL_URL}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Run this SQL query: SELECT * FROM information_schema.tables WHERE table_schema = \'public\' LIMIT 5'
            }
          }
        ]
      })
    });
    
    console.log(`Query tool status: ${queryResponse.status} ${queryResponse.statusText}`);
    
    try {
      const queryData = await queryResponse.json();
      console.log('Query response:', JSON.stringify(queryData, null, 2).substring(0, 300) + '...');
    } catch (e) {
      const queryText = await queryResponse.text();
      console.log('Query response (text):', queryText.substring(0, 300) + '...');
    }
    
  } catch (error) {
    console.error('Error testing MCP:', error.message);
  }
}

testMCPSchemaAndTools(); 