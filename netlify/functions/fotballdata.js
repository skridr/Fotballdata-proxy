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
  const { type, clubid, cid, cwd, count, teamid } = event.queryStringParameters || {};
  
  // Valider påkrevde parametere
  if (!type || !cid || !cwd) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Mangler påkrevde parametere: type, cid, cwd' 
      })
    };
  }

  try {
    // Bygg URL basert på type
    let url = `http://api.fotballdata.no/js.fd?type=${type}&cid=${cid}&cwd=${cwd}&format=json`;
    
    if (clubid) url += `&clubid=${clubid}`;
    if (teamid) url += `&teamid=${teamid}`;
    if (count) url += `&count=${count}`;
    
    console.log('Tester endpoint:', url);
    
    const response = await fetch(url);
    const jsCode = await response.text();
    
    // Sjekk om det er en gyldig respons
    if (response.status === 404 || jsCode.includes('404') || jsCode.includes('Not Found')) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: `Endpoint '${type}' ikke funnet`,
          tested_url: url
        })
      };
    }
    
    // Parse JavaScript document.write() til HTML
    function parseJavaScriptToHtml(jsCode) {
      if (!jsCode.includes('document.write')) {
        // Ikke JavaScript - returner rå data
        return jsCode;
      }
      
      const writeMatches = jsCode.match(/document\.write\("(.*)"\);/g) || [];
      let html = '';
      
      writeMatches.forEach(match => {
        const content = match.match(/document\.write\("(.*)"\);/)[1];
        // Unescale HTML entities
        const unescaped = content
          .replace(/\\"/g, '"')
          .replace(/&#229;/g, 'å')
          .replace(/&#248;/g, 'ø')
          .replace(/&#230;/g, 'æ')
          .replace(/&#197;/g, 'Å')
          .replace(/&#216;/g, 'Ø')
          .replace(/&#198;/g, 'Æ');
        html += unescaped;
      });
      
      return html;
    }
    
    // Parse matches eller annen data
    function parseDataFromHtml(html, dataType) {
      const results = [];
      
      // Søk etter logo-URLer
      const logoPatterns = [
        /src=["']([^"']*(?:logo|crest|emblem)[^"']*\.(?:png|jpg|jpeg|gif|svg))/gi,
        /href=["']([^"']*(?:logo|crest|emblem)[^"']*\.(?:png|jpg|jpeg|gif|svg))/gi,
        /(https?:\/\/[^\s"']*(?:logo|crest|emblem)[^\s"']*\.(?:png|jpg|jpeg|gif|svg))/gi
      ];
      
      const logos = [];
      logoPatterns.forEach(pattern => {
        const matches = [...html.matchAll(pattern)];
        matches.forEach(match => logos.push(match[1]));
      });
      
      if (logos.length > 0) {
        console.log('Logoer funnet:', logos);
      }
      
      // For klubb-typer, parse kampdata
      if (dataType.includes('club') && dataType.includes('next') || dataType.includes('prev')) {
        const matchPattern = /<li>(.*?)<\/li>/gs;
        const matchResults = [...html.matchAll(matchPattern)];
        
        matchResults.forEach(match => {
          const content = match[1];
          
          // Parse dato og tid
          const dateTimeMatch = content.match(/>([^<]+\.\d+\.\d+\.?\d*)<\/a> kl (\d+:\d+)/);
          const date = dateTimeMatch ? dateTimeMatch[1] : '';
          const time = dateTimeMatch ? dateTimeMatch[2] : '';
          
          // Parse turnering
          const tournamentMatch = content.match(/turnering[^>]*>([^<]+)</);
          const tournament = tournamentMatch ? tournamentMatch[1].replace(/&#\d+;/g, match => 
            ({ '&#229;': 'å', '&#248;': 'ø', '&#230;': 'æ' }[match] || match)
          ) : '';
          
          // Parse lag og sted
          let homeTeam = '', awayTeam = '', venue = '';
          
          if (content.includes('hjemme mot')) {
            const homeMatch = content.match(/laget[^>]*>([^<]+)<\/a>[^<]*hjemme mot/);
            const awayMatch = content.match(/hjemme mot[^>]*laget[^>]*>([^<]+)</);
            homeTeam = homeMatch ? homeMatch[1] : '';
            awayTeam = awayMatch ? awayMatch[1] : '';
            venue = 'Hjemme';
          } else if (content.includes('borte mot')) {
            const awayTeamMatch = content.match(/laget[^>]*>([^<]+)<\/a>[^<]*borte mot/);
            const homeTeamMatch = content.match(/borte mot[^>]*laget[^>]*>([^<]+)</);
            awayTeam = awayTeamMatch ? awayTeamMatch[1] : '';
            homeTeam = homeTeamMatch ? homeTeamMatch[1] : '';
            venue = 'Borte';
          }
          
          // Parse resultat
          const resultMatch = content.match(/(\d+-\d+)/);
          const result = resultMatch ? resultMatch[1] : '';
          
          if (date && (homeTeam || awayTeam)) {
            results.push({
              date: date,
              time: time,
              homeTeam: homeTeam,
              awayTeam: awayTeam,
              venue: venue,
              tournament: tournament,
              result: result || undefined
            });
          }
        });
      }
      
      return {
        matches: results,
        logos: logos,
        rawHtml: html.substring(0, 1000) // First 1000 chars for debugging
      };
    }
    
    // Konverter JavaScript til HTML
    const html = parseJavaScriptToHtml(jsCode);
    
    // Parse data fra HTML
    const parsedData = parseDataFromHtml(html, type);
    
    // Return strukturert JSON data
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        success: true,
        type: type,
        clubId: clubid,
        teamId: teamid,
        matches: parsedData.matches,
        logos: parsedData.logos,
        totalMatches: parsedData.matches.length,
        totalLogos: parsedData.logos.length,
        lastUpdated: new Date().toISOString(),
        debug: {
          url: url,
          hasJavaScript: jsCode.includes('document.write'),
          responseLength: jsCode.length,
          htmlPreview: parsedData.rawHtml
        }
      })
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
        error: 'Feil ved henting av fotballdata: ' + error.message,
        type: type,
        tested_url: `http://api.fotballdata.no/js.fd?type=${type}&cid=${cid}&cwd=${cwd}`
      })
    };
  }
};
