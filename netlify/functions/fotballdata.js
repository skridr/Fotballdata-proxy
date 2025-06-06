// Erstatt parseMatchesFromHtml funksjonen med denne forbedrede versjonen:
function parseMatchesFromHtml(html, matchType) {
  const matches = [];
  
  // Match hele <li>-elementer
  const liPattern = /<li>(.*?)<\/li>/gs;
  let liMatch;
  
  while ((liMatch = liPattern.exec(html)) !== null) {
    const liContent = liMatch[1];
    
    // Parse dato og tid
    const dateTimePattern = />([^<]*\d+\.\d+\.\d*)<\/a>\s*kl\s*(\d+:\d+)/;
    const dateTimeMatch = liContent.match(dateTimePattern);
    
    if (dateTimeMatch) {
      const date = dateTimeMatch[1].trim();
      const time = dateTimeMatch[2];
      
      // Parse turnering
      const tournamentPattern = /turnering[^>]*>([^<]+)</;
      const tournamentMatch = liContent.match(tournamentPattern);
      const tournament = tournamentMatch ? tournamentMatch[1].trim() : '';
      
      // Forbedret parsing av hjemme/borte og lagnavnene
      let homeTeam = '', awayTeam = '', venue = '';
      
      // Mønster: <a>Lagnavn</a> <a>hjemme</a> mot <a>Motstanderlag</a>
      // eller: <a>Lagnavn</a> <a>borte</a> mot <a>Motstanderlag</a>
      
      if (liContent.includes('hjemme</a> mot')) {
        // Hjemmekamp: Finn laget som spiller hjemme
        const homePattern = /laget[^>]*>([^<]+)<\/a>[^<]*<[^>]*>hjemme<\/a>\s*mot/;
        const awayPattern = /hjemme<\/a>\s*mot[^>]*laget[^>]*>([^<]+)<\/a>/;
        
        const homeMatch = liContent.match(homePattern);
        const awayMatch = liContent.match(awayPattern);
        
        homeTeam = homeMatch ? homeMatch[1].trim() : '';
        awayTeam = awayMatch ? awayMatch[1].trim() : '';
        venue = 'Hjemme';
      } else if (liContent.includes('borte</a> mot')) {
        // Bortekamp: Finn laget som spiller borte
        const awayPattern = /laget[^>]*>([^<]+)<\/a>[^<]*<[^>]*>borte<\/a>\s*mot/;
        const homePattern = /borte<\/a>\s*mot[^>]*laget[^>]*>([^<]+)<\/a>/;
        
        const awayMatch = liContent.match(awayPattern);
        const homeMatch = liContent.match(homePattern);
        
        awayTeam = awayMatch ? awayMatch[1].trim() : '';
        homeTeam = homeMatch ? homeMatch[1].trim() : '';
        venue = 'Borte';
      } else {
        // Fallback: Prøv å finne lagnavnene uten hjemme/borte indikator
        const teamPatterns = /laget[^>]*>([^<]+)<\/a>/g;
        const teamMatches = [...liContent.matchAll(teamPatterns)];
        
        if (teamMatches.length >= 2) {
          homeTeam = teamMatches[0][1].trim();
          awayTeam = teamMatches[1][1].trim();
          venue = 'TBD';
        } else if (teamMatches.length === 1) {
          // Kun ett lag funnet - antagelig Ekholt
          const foundTeam = teamMatches[0][1].trim();
          if (foundTeam.toLowerCase().includes('ekholt')) {
            homeTeam = foundTeam;
            awayTeam = 'TBD';
            venue = 'TBD';
          } else {
            homeTeam = 'Ekholt';
            awayTeam = foundTeam;
            venue = 'TBD';
          }
        }
      }
      
      // Parse resultat for tidligere kamper
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
