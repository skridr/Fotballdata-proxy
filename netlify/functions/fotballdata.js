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
  const { type, clubid, cid, cwd, count, filter, homeonly } = event.queryStringParameters || {};
  
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
    
    // Parse JavaScript til HTML
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
          .replace(/&#230;/g, 'æ')
          .replace(/&#197;/g, 'Å')
          .replace(/&#216;/g, 'Ø')
          .replace(/&#198;/g, 'Æ');
        html += content;
      }
      
      return html;
    }
    
    // Parse kamper fra HTML
    function parseMatchesFromHtml(html) {
      const matches = [];
      
      const liPattern = /<li>(.*?)<\/li>/gs;
      let liMatch;
      
      while ((liMatch = liPattern.exec(html)) !== null) {
        const liContent = liMatch[1];
        
        // Parse dato og tid
        const dateTimePattern = /<a[^>]*>([^<]*\d+\.\d+\.\d*)<\/a>\s*kl\s*(\d+:\d+)/;
        const dateTimeMatch = liContent.match(dateTimePattern);
        
        if (dateTimeMatch) {
          const date = dateTimeMatch[1].trim();
          const time = dateTimeMatch[2];
          
          // Parse turnering
          const tournamentPattern = /<a[^>]*title='Se mer om turneringen[^>]*>([^<]+)<\/a>/;
          const tournamentMatch = liContent.match(tournamentPattern);
          const tournament = tournamentMatch ? tournamentMatch[1].trim() : '';
          
          // Parse lagnavnene
          let homeTeam = '', awayTeam = '', venue = '';
          
          const teamLinkPattern = /<a[^>]*title='Se mer om laget[^>]*>([^<]+)<\/a>/g;
          const teamMatches = [...liContent.matchAll(teamLinkPattern)];
          
          if (liContent.includes('>hjemme</a> mot')) {
            // Hjemmekamp
            if (teamMatches.length >= 2) {
              homeTeam = teamMatches[0][1].trim();
              awayTeam = teamMatches[1][1].trim();
              venue = 'Hjemme';
            }
          } else if (liContent.includes('>borte</a> mot')) {
            // Bortekamp
            if (teamMatches.length >= 2) {
              awayTeam = teamMatches[0][1].trim();
              homeTeam = teamMatches[1][1].trim();
              venue = 'Borte';
            }
          } else if (teamMatches.length >= 1) {
            // Fallback
            homeTeam = teamMatches[0][1] ? teamMatches[0][1].trim() : 'Ekholt';
            awayTeam = teamMatches[1] ? teamMatches[1][1].trim() : 'TBD';
            venue = 'TBD';
          }
          
          // Parse resultat
          const resultPattern = /(\d+-\d+)/;
          const resultMatch = liContent.match(resultPattern);
          const result = resultMatch ? resultMatch[1] : '';
          
          // Parse dato til Date objekt for sammenligning
          const parsedDate = parseNorwegianDate(date);
          
          matches.push({
            date: date,
            time: time,
            homeTeam: homeTeam || 'TBD',
            awayTeam: awayTeam || 'TBD',
            venue: venue || 'TBD',
            tournament: tournament,
            result: result || undefined,
            parsedDate: parsedDate
          });
        }
      }
      
      return matches;
    }
    
    // Parse norsk dato til Date objekt
    function parseNorwegianDate(dateStr) {
      try {
        // Format: "fre. 6.6.25" -> konverter til "2025-06-06"
        const dateMatch = dateStr.match(/(\d+)\.(\d+)\.(\d+)/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]);
          let year = parseInt(dateMatch[3]);
          
          // Anta 20xx hvis år er 2-sifret
          if (year < 100) {
            year += 2000;
          }
          
          return new Date(year, month - 1, day);
        }
        return new Date();
      } catch (e) {
        return new Date();
      }
    }
    
    // Filtrer kamper basert på parametere
    function filterMatches(matches, filterType, homeOnly) {
      let filtered = matches;
      
      // Filtrer kun hjemmekamper hvis forespurt
      if (homeOnly === 'true') {
        filtered = filtered.filter(match => match.venue === 'Hjemme');
      }
      
      // Filtrer på dato
      if (filterType) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (filterType === 'today') {
          filtered = filtered.filter(match => {
            return match.parsedDate && 
                   match.parsedDate.toDateString() === today.toDateString();
          });
        } else if (filterType === 'yesterday') {
          filtered = filtered.filter(match => {
            return match.parsedDate && 
                   match.parsedDate.toDateString() === yesterday.toDateString();
          });
        }
      }
      
      // Begrens til 4 kamper
      return filtered.slice(0, 4);
    }
    
    // Konverter og parse
    const html = parseJavaScriptToHtml(jsCode);
    const allMatches = parseMatchesFromHtml(html);
    const filteredMatches = filterMatches(allMatches, filter, homeonly);
    
    console.log(`Filtrerte ${filteredMatches.length} kamper fra ${allMatches.length} totalt`);
    
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
        matches: filteredMatches,
        totalMatches: filteredMatches.length,
        totalFound: allMatches.length,
        filters: {
          dateFilter: filter,
          homeOnly: homeonly === 'true'
        },
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
