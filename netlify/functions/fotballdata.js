exports.handler = async (event, context) => {
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

  const { type, clubid, cid, cwd, count } = event.queryStringParameters || {};
  if (!type || !clubid || !cid || !cwd) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Mangler parametere: type, clubid, cid, cwd' })
    };
  }

  try {
    const url = `http://api.fotballdata.no/js.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json${count ? `&count=${count}` : ''}`;
    const response = await fetch(url);
    const jsCode = await response.text();

    const match = jsCode.match(/document\.write\("([\s\S]+?)"\);/);
    if (!match) {
      throw new Error("Fant ikke document.write");
    }

    let html = match[1]
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/&#229;/g, 'å')
      .replace(/&#248;/g, 'ø')
      .replace(/&#230;/g, 'æ')
      .replace(/&#197;/g, 'Å')
      .replace(/&#216;/g, 'Ø')
      .replace(/&#198;/g, 'Æ');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        success: true,
        html: html,
        info: {
          type, clubid, cid, cwd, count,
          sourceUrl: url,
          contentLength: html.length,
          timestamp: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Parsing-feil: ' + error.message })
    };
  }
};
