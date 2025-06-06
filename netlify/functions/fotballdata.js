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
      if (!jsCode.includes('document.write')) {
        return jsCode;
      }
      
      // Robust parsing av document.write statements
      const writePattern = /document\.write\("([^"]*)"\);/g;
      let html = '';
      let match;
      
      while ((match = writePattern.exec(jsCode)) !== null) {
        let content = match[1];
        // Unescale HTML entities og JavaScript escaping
        content = content
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/&#229;/g, 'å')
          .replace(/&#248;/g, 'ø')
          .replace(/&#230;/g, 'æ')
          .replace(/&#197;/g, 'Å')
          .replace(/&#216;/g, 'Ø')
          .replace(/&#198;/g, 'Æ');
        html += content;
      }
      
      return html;
    }
    
    // Parse kamper fra HTML
    function parseMatchesFromHtml(html, matchType) {
      const matches = [];
      
      // Match hele <li>-elementer
      const liPattern = /<li>(.*?)<\/li>/gs;
      let liMatch;
      
      while ((liMatch = liPattern.exec(html)) !== null) {
        const liContent = liMatch[1];
        
        // Parse dato og tid - mer fleksibel regex
        const dateTimePattern = />([^<]*\d+\.\d+\.\d*)<\/a>\s*kl\s*(\d+:\d+)/;
        const dateTimeMatch = liContent.match(dateTimePattern);
        
        if (dateTimeMatch) {
          const date = dateTimeMatch[1].trim();
          const time = dateTimeMatch[2];
          
          // Parse turnering
          const tournamentPattern = /turnering[^>]*>([^<]+)</;
          const tournamentMatch = liContent.match(tournamentPattern);
          const tournament = tournamentMatch ? tournamentMatch[1].trim() : '';
          
          // Parse hjemme/borte
          let homeTeam = '', awayTeam = '', venue = '';
          
          if (liContent.includes('hjemme mot')) {
            const homePattern = /laget[^>]*>([^<]+)<\/a>[^<]*hjemme\s+mot/;
            const awayPattern = /hjemme\s+mot[^>]*laget[^>]*>([^<]+)</;
            
            const homeMatch = liContent.match(homePattern);
            const awayMatch = liContent.match(awayPattern);
            
            homeTeam = homeMatch ? homeMatch[1].trim() : '';
            awayTeam = awayMatch ? awayMatch[1].trim() : '';
            venue = 'Hjemme';
          } else if (liContent.includes('borte mot')) {
            const awayPattern = /laget[^>]*>([^<]+)<\/a>[^<]*borte\s+mot/;
            const homePattern = /borte\s+mot[^>]*laget[^>]*>([^<]+)</;
            
            const awayMatch = liContent.match(awayPattern);
            const homeMatch = liContent.match(homePattern);
            
            awayTeam = awayMatch ? awayMatch[1].trim() : '';
            homeTeam = homeMatch ? homeMatch[1].trim() : '';
            venue = 'Borte';
          }
          
          // Parse resultat for tidligere kamper
          const resultPattern = /(\d+-\d+)/;
          const resultMatch = liContent.match(resultPattern);
          const result = resultMatch ? resultMatch[1] : '';
          
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
      }
      
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
        lastUpdated: new Date().toISOString(),
        clubLogo: `http://logo.fotballdata.no/logos/${clubid}.jpg?w=120`
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
