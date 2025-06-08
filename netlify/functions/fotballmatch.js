// Netlify Function: .netlify/functions/fotballmatch.js
// Spesialisert for å hente kampdata via FiksID
// Berører IKKE eksisterende fotballdata.js

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { fiksid, action = 'match' } = event.queryStringParameters || {};

    if (!fiksid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'fiksid parameter is required',
          usage: '?fiksid=8698452&action=match'
        })
      };
    }

    console.log(`FotballMatch request: fiksid=${fiksid}, action=${action}`);

    switch (action) {
      case 'match':
        return await handleMatchData(fiksid, headers);
      
      case 'events':
        return await handleMatchEvents(fiksid, headers);
      
      case 'live':
        return await handleLiveMatch(fiksid, headers);
      
      default:
        return await handleMatchData(fiksid, headers);
    }

  } catch (error) {
    console.error('FotballMatch function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        fiksid: event.queryStringParameters?.fiksid
      })
    };
  }
};

// Hovedfunksjon for å hente kampdata
async function handleMatchData(fiksId, headers) {
  try {
    console.log(`Fetching match data for FiksID: ${fiksId}`);
    
    // Prøv forskjellige metoder for å hente kampdata
    let matchData = await fetchFromFotballNoAPI(fiksId);
    
    if (!matchData) {
      matchData = await fetchFromFotballNoScraping(fiksId);
    }
    
    if (!matchData) {
      matchData = getMockMatchData(fiksId);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        match: matchData,
        source: matchData.source || 'unknown',
        fiksId: fiksId,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error(`Error fetching match ${fiksId}:`, error);
    
    // Fallback til mock data
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        match: getMockMatchData(fiksId),
        source: 'mock',
        error: error.message,
        fiksId: fiksId
      })
    };
  }
}

// Prøv å hente fra fotball.no API
async function fetchFromFotballNoAPI(fiksId) {
  const possibleUrls = [
    `https://www.fotball.no/api/match/${fiksId}`,
    `https://api.fotball.no/matches/${fiksId}`,
    `https://www.fotball.no/fotballdata/kamp/api/?fiksId=${fiksId}`,
    `https://fiks.fotball.no/api/public/match/${fiksId}`,
    `https://www.fotball.no/ajax/match/${fiksId}`
  ];

  for (const url of possibleUrls) {
    try {
      console.log(`Trying API URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CloudCast-Scoreboard/1.0',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.fotball.no/',
          'Accept-Language': 'no,en;q=0.9'
        },
        timeout: 5000
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log(`Success from API: ${url}`);
          const parsed = parseMatchDataFromAPI(data, fiksId);
          if (parsed) {
            parsed.source = 'fotball.no-api';
            return parsed;
          }
        }
      }
    } catch (e) {
      console.log(`Failed API ${url}:`, e.message);
      continue;
    }
  }

  return null;
}

// Parse API response
function parseMatchDataFromAPI(data, fiksId) {
  try {
    // Håndter forskjellige API-strukturer
    const match = data.match || data.data || data;
    
    if (!match) return null;

    const homeTeam = extractTeamName(match.homeTeam || match.home || match.hjemmelag);
    const awayTeam = extractTeamName(match.awayTeam || match.away || match.bortelag);
    
    if (!homeTeam || !awayTeam) return null;

    const tournament = match.tournament?.name || match.serie || match.turnering || "Ukjent turnering";
    const events = parseEvents(match.events || match.hendelser || []);
    
    const score = {
      home: parseInt(match.homeScore || match.hjemmemaal || 0),
      away: parseInt(match.awayScore || match.bortemaal || 0)
    };

    return {
      fiksId: fiksId,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      tournament: tournament,
      date: match.date || match.dato || new Date().toISOString(),
      status: match.status || match.kampstatus || "unknown",
      score: score,
      events: events,
      venue: "Hjemme",
      time: parseInt(match.currentTime || match.spilletid || 0),
      source: 'fotball.no-api'
    };

  } catch (error) {
    console.error('Error parsing API data:', error);
    return null;
  }
}

// Ekstraher lag-navn fra forskjellige strukturer
function extractTeamName(teamObj) {
  if (!teamObj) return null;
  if (typeof teamObj === 'string') return teamObj;
  return teamObj.name || teamObj.navn || teamObj.lagNavn || null;
}

// Scraping fallback
async function fetchFromFotballNoScraping(fiksId) {
  try {
    const url = `https://www.fotball.no/fotballdata/kamp/?fiksId=${fiksId}`;
    console.log(`Trying scraping: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 8000
    });

    if (!response.ok) {
      console.log(`Scraping failed: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    console.log(`Scraping response length: ${html.length}`);
    
    // Flere parsing-strategier
    let matchData = parseMatchFromHTML(html, fiksId);
    
    if (!matchData) {
      matchData = parseMatchFromMetaTags(html, fiksId);
    }
    
    if (!matchData) {
      matchData = parseMatchFromTitle(html, fiksId);
    }

    if (matchData) {
      matchData.source = 'fotball.no-scraping';
      console.log(`Scraping success: ${matchData.homeTeam} vs ${matchData.awayTeam}`);
    }

    return matchData;

  } catch (error) {
    console.error('Scraping error:', error);
    return null;
  }
}

// Parse match fra HTML
function parseMatchFromHTML(html, fiksId) {
  try {
    // Prøv forskjellige HTML-patterns
    const patterns = [
      // Pattern 1: Standard kamp-side
      /<h1[^>]*>([^<]+)\s*-\s*([^<]+)<\/h1>/i,
      // Pattern 2: Med span/div struktur  
      /<h[1-6][^>]*><[^>]+>([^<]+)<[^>]+>\s*-\s*<[^>]+>([^<]+)<[^>]+><\/h[1-6]>/i,
      // Pattern 3: Enkel struktur
      /<div[^>]*class="[^"]*match[^"]*"[^>]*>.*?([A-ZÆØÅa-zæøå\s]+)\s*-\s*([A-ZÆØÅa-zæøå\s]+)/si,
      // Pattern 4: Fra title attribute  
      /title="([^"]+)\s*-\s*([^"]+)"/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[2]) {
        const homeTeam = match[1].trim();
        const awayTeam = match[2].trim();
        
        // Valider at dette ser ut som lag-navn
        if (isValidTeamName(homeTeam) && isValidTeamName(awayTeam)) {
          return {
            fiksId: fiksId,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            tournament: extractTournamentFromHTML(html),
            date: new Date().toISOString(),
            status: "unknown",
            score: { home: 0, away: 0 },
            events: [],
            venue: "Hjemme",
            time: 0
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('HTML parsing error:', error);
    return null;
  }
}

// Parse fra meta tags
function parseMatchFromMetaTags(html, fiksId) {
  try {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1];
      const teamMatch = title.match(/([^-]+)\s*-\s*([^-]+)/);
      if (teamMatch) {
        return {
          fiksId: fiksId,
          homeTeam: teamMatch[1].trim(),
          awayTeam: teamMatch[2].trim(),
          tournament: "Fra meta tags",
          date: new Date().toISOString(),
          status: "unknown", 
          score: { home: 0, away: 0 },
          events: [],
          venue: "Hjemme",
          time: 0
        };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Parse fra page title
function parseMatchFromTitle(html, fiksId) {
  // Siste fallback - ekstraher fra URL eller andre hints
  return null;
}

// Valider lag-navn
function isValidTeamName(name) {
  if (!name || name.length < 2) return false;
  if (name.length > 50) return false;
  
  // Ikke godta vanlige HTML-tags eller metadata
  const invalidPatterns = [
    /^(div|span|h\d|p|a|ul|li)$/i,
    /^\d+$/,
    /(javascript|function|var|document)/i,
    /^(null|undefined|true|false)$/i
  ];
  
  return !invalidPatterns.some(pattern => pattern.test(name));
}

// Ekstraher turnering fra HTML
function extractTournamentFromHTML(html) {
  const patterns = [
    /<span[^>]*class="[^"]*tournament[^"]*"[^>]*>([^<]+)<\/span>/i,
    /<div[^>]*class="[^"]*tournament[^"]*"[^>]*>([^<]+)<\/div>/i,
    /Turnering[^:]*:\s*([^<\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return "Ukjent turnering";
}

// Parse kamphendelser
function parseEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) return [];
  
  return rawEvents.map(event => {
    let type = 'unknown';
    
    if (event.type) {
      type = event.type.toLowerCase();
    } else if (event.hendelse) {
      const h = event.hendelse.toLowerCase();
      if (h.includes('mål') || h.includes('goal')) type = 'goal';
      else if (h.includes('gult') || h.includes('yellow')) type = 'yellow';
      else if (h.includes('rødt') || h.includes('red')) type = 'red';
    }

    return {
      type: type,
      player: event.player?.name || event.spiller || "Ukjent spiller",
      team: event.team || (event.isHome ? 'home' : 'away'),
      time: parseInt(event.time || event.minutt || 0),
      description: event.description || event.beskrivelse || ''
    };
  }).filter(event => ['goal', 'yellow', 'red'].includes(event.type));
}

// Mock data for testing
function getMockMatchData(fiksId) {
  const mockMatches = {
    "8698452": {
      homeTeam: "Ekholt",
      awayTeam: "IL Borgar",
      tournament: "Østfold 4. divisjon",
      events: [
        { type: "goal", player: "Erik Hansen", team: "home", time: 23, description: "Flott mål fra 16 meter" },
        { type: "goal", player: "Lars Andersen", team: "away", time: 35, description: "Header etter corner" },
        { type: "yellow", player: "Petter Olsen", team: "home", time: 52, description: "Gult kort for filming" },
        { type: "goal", player: "Jon Bakken", team: "away", time: 67, description: "Straffemål" }
      ]
    },
    "8700000": {
      homeTeam: "Fredrikstad FK",
      awayTeam: "Sarpsborg 08", 
      tournament: "Eliteserien",
      events: [
        { type: "goal", player: "Marcus Pedersen", team: "home", time: 15, description: "Sprikt skudd" },
        { type: "yellow", player: "Joni Kauko", team: "away", time: 28, description: "Hard takling" }
      ]
    }
  };

  const mockData = mockMatches[fiksId] || {
    homeTeam: "Hjemmelag Test",
    awayTeam: "Bortelag Test", 
    tournament: "Test-turnering",
    events: []
  };

  return {
    fiksId: fiksId,
    ...mockData,
    date: new Date().toISOString(),
    status: "live",
    score: { 
      home: mockData.events?.filter(e => e.type === 'goal' && e.team === 'home').length || 1,
      away: mockData.events?.filter(e => e.type === 'goal' && e.team === 'away').length || 2
    },
    venue: "Hjemme",
    time: 78,
    source: 'mock'
  };
}

// Handler for live kamphendelser
async function handleMatchEvents(fiksId, headers) {
  // Implementer senere for real-time events
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      events: [],
      message: "Live events not implemented yet"
    })
  };
}

// Handler for live kamp-status
async function handleLiveMatch(fiksId, headers) {
  // Implementer senere for live status
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      isLive: false,
      message: "Live status not implemented yet"
    })
  };
}
