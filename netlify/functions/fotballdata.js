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
    // Hent data fra fotballdata.no
    const url = `http://api.fotballdata.no/js.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json${count ? `&count=${count}` : ''}`;
    
    const response = await fetch(url);
    const jsCode = await response.text();
    
    // Parse JavaScript document.write() til HTML
    function parseJavaScriptToHtml(jsCode) {
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
    
    // Parse HTML til strukturert data
    function parseMatchesFromHtml(html, matchType) {
      const matches = [];
      
      // Regex for å finne kamper (basert på mønsteret vi så)
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
        const teamMatch = content.match(/laget[^>]*>([^<]+)</g);
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
        
        // Parse resultat (for tidligere kamper)
        const resultMatch = content.match(/(\d+-\d+)/);
        const result = resultMatch ? resultMatch[1] : '';
        
        if (date && (homeTeam || awayTeam)) {
          matches.push({
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
      
      return matches;
    }
    
    // Konverter JavaScript til HTML
    const html = parseJavaScriptToHtml(jsCode);
    
    // Parse kamper fra HTML
    const matches = parseMatchesFromHtml(html, type);
    
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
        matches: matches,
        totalMatches: matches.length,
        lastUpdated: new Date().toISOString()
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
        error: 'Feil ved henting av fotballdata: ' + error.message
      })
    };
  }
};
