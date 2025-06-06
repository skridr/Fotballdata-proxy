exports.handler = async (event, context) => {
  // Håndter CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // Hent query parameters
  const { type, clubid, cid, cwd, count } = event.queryStringParameters || {};
  
  // Valider påkrevde parametere
  if (!type || !clubid || !cid || !cwd) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Mangler påkrevde parametere: type, clubid, cid, cwd' 
      })
    };
  }

  try {
    // Prøv forskjellige API endpoints
    const endpoints = [
      // Endpoint 1: js.fd (fra demo)
      `http://api.fotballdata.no/js.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json${count ? `&count=${count}` : ''}`,
      // Endpoint 2: Original radata med HTTP
      `http://api.fotballdata.no/radata.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json${count ? `&count=${count}` : ''}`,
      // Endpoint 3: Alternativ format
      `https://api.fotballdata.no/js.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json${count ? `&count=${count}` : ''}`
    ];

    let lastError;
    
    for (const url of endpoints) {
      try {
        console.log('Prøver endpoint:', url);
        
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.text();
          
          // Sjekk om det er JavaScript eller JSON
          if (data.includes('document.write') || data.includes('function')) {
            // Det er JavaScript - prøv å parse ut JSON data
            const jsonMatch = data.match(/\{.*\}/s);
            if (jsonMatch) {
              const jsonData = JSON.parse(jsonMatch[0]);
              return {
                statusCode: 200,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(jsonData)
              };
            }
          } else {
            // Prøv direkte JSON parse
            const jsonData = JSON.parse(data);
            return {
              statusCode: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(jsonData)
            };
          }
        }
        
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        
      } catch (err) {
        lastError = err.message;
        console.log('Endpoint feilet:', url, err.message);
      }
    }
    
    // Alle endpoints feilet
    throw new Error(`Alle endpoints feilet. Siste feil: ${lastError}`);

  } catch (error) {
    console.error('Feil ved henting av data:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Feil ved henting av fotballdata: ' + error.message,
        debug: `Prøvde type=${type}, clubid=${clubid}, cid=${cid}`
      })
    };
  }
};
