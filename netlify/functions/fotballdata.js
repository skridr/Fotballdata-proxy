// Erstatt parseJavaScriptToHtml funksjonen med:
function parseJavaScriptToHtml(jsCode) {
  if (!jsCode.includes('document.write')) {
    return jsCode;
  }
  
  // Mer robust parsing av document.write statements
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

// Oppdater parseDataFromHtml for bedre match-parsing:
function parseDataFromHtml(html, dataType) {
  const results = [];
  
  // For klubbkamper - mer robust parsing
  if (dataType === 'clubnext' || dataType === 'clubprev') {
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
    }
  }
  
  return {
    matches: results,
    logos: [], // Kampdata inneholder ikke logoer
    rawHtml: html.substring(0, 1500)
  };
}
