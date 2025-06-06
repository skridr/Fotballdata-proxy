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
      
      const writePattern = /document\.write\("([^"]*)"\);/g;
      let html = '';
      let match;
      
      while ((match = writePattern.exec(jsCode)) !== null) {
        let content = match[1];
        content = content
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/&#229;/g, 'å')
          .replace(/&#248;/g, 'ø')
          .replace(/&#230;/g, 'æ');
        html += content;
      }
      
      return html;
    }
    
    // Parse kamper fra HTML basert på faktisk struktur
    function parseMatchesFromHtml(html) {
      const matches = [];
      
      // Fra htmlPreview ser vi strukturen:
      // <li><p><span><a>dato</a> kl tid</span> <span><a>turnering</a></span> <span><a>Ekholt</a> <a>hjemme/borte</a> mot <a>motstanderlag</a></span></p></li>
      
      const liPattern = /<li>(.*?)<\/li>/gs;
      let liMatch;
      
      while ((liMatch = liPattern.exec(html)) !== null) {
        const liContent = liMatch[1];
        
        // Parse dato og tid fra første span
        const dateTimePattern = /<a[^>]*>([^<]*\d+\.\d+\.\d*)<\/a>\s*kl\s*(\d+:\d+)/;
        const dateTimeMatch = liContent.match(dateTimePattern);
        
        if (dateTimeMatch) {
          const date = dateTimeMatch[1].trim();
          const time = dateTimeMatch[2];
          
          // Parse turnering fra andre span
          const tournamentPattern = /<a[^>]*title='Se mer om turneringen[^>]*>([^<]+)<\/a>/;
          const tournamentMatch = liContent.match(tournamentPattern);
          const tournament = tournamentMatch ? tournamentMatch[1].trim() : '';
          
          // Parse lagnavnene fra tredje span
          let homeTeam = '', awayTeam = '', venue = '';
          
          // Finn alle lag-linker i tredje span
          const teamLinkPattern = /<a[^>]*title='Se mer om laget[^>]*>([^<]+)<\/a>/g;
          const teamMatches = [...liContent.matchAll(teamLinkPattern)];
          
          // Sjekk for hjemme/borte-indikatorer
          if (liContent.includes('>hjemme</a> mot')) {
            // Hjemmekamp - første lag er hjemmelaget
            if (teamMatches.length >= 2) {
              homeTeam = teamMatches[0][1].trim();
              awayTeam = teamMatches[1][1].trim();
              venue = 'Hjemme';
            }
          } else if (liContent.includes('>borte</a> mot')) {
            // Bortekamp - første lag spiller borte
            if (teamMatches.length >= 2) {
              awayTeam = teamMatches[0][1].trim();
              homeTeam = teamMatches[1][1].trim();
              venue = 'Borte';
            }
          } else if (teamMatches.length >= 1) {
            // Fallback - antagelig hjemmekamp hvis ikke spesifisert
            homeTeam = teamMatches[0][1] ? teamMatches[0][1].trim() : 'Ekholt';
            awayTeam = teamMatches[1] ? teamMatches[1][1].trim() : 'TBD';
            venue = 'TBD';
          }
          
          // Parse resultat (for clubprev)
          const resultPattern = /(\d+-\d+)/;
          const resultMatch = liContent.match(resultPattern);
          const result = resultMatch ? resultMatch[1] : '';
          
          matches.push({
            date: date,
            time: time,
            homeTeam: homeTeam || 'TBD',
            awayTeam: awayTeam || 'TBD',
            venue: venue || 'TBD',
            tournament: tournament,
            result: result || undefined
          });
        }
      }
      
      return matches;
    }
    
    // Konverter JavaScript til HTML
    const html = parseJavaScriptToHtml(jsCode);
    
    // Debug: Log første kamp for å se struktur
    const firstLiMatch = html.match(/<li>(.*?)<\/li>/s);
    if (firstLiMatch) {
      console.log('🔍 HTML struktur første kamp:', firstLiMatch[0]);
    }
    
    // Parse kamper fra HTML
    const matches = parseMatchesFromHtml(html);
    
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
