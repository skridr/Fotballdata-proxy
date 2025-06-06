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
    // Bygg URL til fotballdata.no
    let url = `https://api.fotballdata.no/radata.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json`;
    if (count) {
      url += `&count=${count}`;
    }

    console.log('Henter data fra:', url);

    // Hent data fra fotballdata.no
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.text(); // Få som tekst først
    
    // Prøv å parse som JSON
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch (e) {
      // Hvis ikke JSON, returner som tekst
      jsonData = { raw: data, error: 'Ikke JSON format' };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 min cache
      },
      body: JSON.stringify(jsonData)
    };

  } catch (error) {
    console.error('Feil ved henting av data:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Feil ved henting av fotballdata: ' + error.message 
      })
    };
  }
};
