exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'test';
    
    console.log('fotballmatch called with action:', action);
    
    if (action === 'matchreferees' || action === 'referees') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          referees: [
            {
              name: 'Neil Janiwarad',
              role: 'Dommer',
              club: 'Sportsklubben Sprint-Jeløy'
            },
            {
              name: 'Roy Philip Hansson',
              role: 'Fadder', 
              club: 'Sportsklubben Sprint-Jeløy'
            }
          ],
          source: 'hardcoded-test'
        })
      };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'fotballmatch function is working',
        action: action,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      })
    };
  }
};
