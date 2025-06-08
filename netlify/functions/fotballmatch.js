const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { action = 'live', clubId = '64' } = event.queryStringParameters || {};
    
    switch (action) {
      case 'live':
        return await getLiveMatch(clubId, headers);
      case 'next':
        return await getNextMatch(clubId, headers);
      case 'referees':
        return await getReferees(clubId, headers);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action parameter' })
        };
    }
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

async function getLiveMatch(clubId, headers) {
  try {
    // First try to get live match
    const liveUrl = `https://www.fotball.no/api/fiks/tournamentMatches/live/${clubId}`;
    const liveResponse = await fetch(liveUrl);
    
    if (liveResponse.ok) {
      const liveData = await liveResponse.json();
      
      if (liveData && liveData.length > 0) {
        const match = liveData[0];
        const processedMatch = await processMatchData(match, true);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            isLive: true,
            match: processedMatch
          })
        };
      }
    }

    // If no live match, get next match
    return await getNextMatch(clubId, headers);
    
  } catch (error) {
    console.error('Error fetching live match:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch live match' })
    };
  }
}

async function getNextMatch(clubId, headers) {
  try {
    const nextUrl = `https://www.fotball.no/api/fiks/tournaments/clubnext/${clubId}`;
    const response = await fetch(nextUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const match = data[0];
      const processedMatch = await processMatchData(match, false);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          isLive: false,
          isUpcoming: true,
          match: processedMatch
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          isLive: false,
          isUpcoming: false,
          message: 'Ingen kommende kamper funnet'
        })
      };
    }
    
  } catch (error) {
    console.error('Error fetching next match:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch next match' })
    };
  }
}

async function getReferees(clubId, headers) {
  try {
    // Try to get current live match first to get referees
    const liveUrl = `https://www.fotball.no/api/fiks/tournamentMatches/live/${clubId}`;
    const liveResponse = await fetch(liveUrl);
    
    if (liveResponse.ok) {
      const liveData = await liveResponse.json();
      
      if (liveData && liveData.length > 0) {
        const match = liveData[0];
        
        // Extract referees from match data
        const referees = extractReferees(match);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ referees })
        };
      }
    }

    // If no live match, return empty referees
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        referees: [],
        message: 'Ingen aktiv kamp - ingen dommere tilgjengelig'
      })
    };
    
  } catch (error) {
    console.error('Error fetching referees:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch referees' })
    };
  }
}

function extractReferees(match) {
  const referees = [];
  
  // Check various possible referee fields in the API response
  if (match.referee) {
    referees.push({
      role: 'Hoveddommer',
      name: match.referee
    });
  }
  
  if (match.assistantReferee1) {
    referees.push({
      role: 'Linjedommer 1',
      name: match.assistantReferee1
    });
  }
  
  if (match.assistantReferee2) {
    referees.push({
      role: 'Linjedommer 2',
      name: match.assistantReferee2
    });
  }
  
  // Check if referees are in a nested structure
  if (match.officials && Array.isArray(match.officials)) {
    match.officials.forEach(official => {
      referees.push({
        role: official.role || 'Dommer',
        name: official.name || official.fullName
      });
    });
  }
  
  // Check alternative referee structure
  if (match.referees && Array.isArray(match.referees)) {
    match.referees.forEach(ref => {
      referees.push({
        role: ref.type || 'Dommer',
        name: ref.name || ref.fullName
      });
    });
  }
  
  return referees;
}

async function processMatchData(match, isLive) {
  try {
    const processed = {
      id: match.fiksId || match.id || match.matchId,
      homeTeam: {
        name: match.homeTeam?.name || match.hjemmelag?.navn || match.homeTeamName,
        logo: match.homeTeam?.logo || match.hjemmelag?.logo,
        score: match.homeTeam?.score || match.hjemmelag?.maal || match.homeScore || 0
      },
      awayTeam: {
        name: match.awayTeam?.name || match.bortelag?.navn || match.awayTeamName,
        logo: match.awayTeam?.logo || match.bortelag?.logo,
        score: match.awayTeam?.score || match.bortelag?.maal || match.awayScore || 0
      },
      status: match.status || match.kampstatus || match.matchStatus,
      startTime: match.startTime || match.starttid || match.kickoff || match.date,
      venue: match.venue?.name || match.bane?.navn || match.venue,
      tournament: {
        name: match.tournament?.name || match.turnering?.navn || match.tournament
      },
      events: await processEvents(match.events || match.hendelser || []),
      isLive: isLive,
      // Additional fields for better data handling
      currentTime: match.currentTime || match.spilletid || match.minute,
      period: match.period || match.periode || match.half,
      referees: extractReferees(match)
    };
    
    return processed;
    
  } catch (error) {
    console.error('Error processing match data:', error);
    throw error;
  }
}

async function processEvents(events) {
  if (!Array.isArray(events)) return [];
  
  return events.map(event => {
    const processed = {
      id: event.id || `event_${Date.now()}_${Math.random()}`,
      type: mapEventType(event.type || event.hendelsestype || event.eventType),
      time: event.time || event.tid || event.minutt || event.minute,
      team: event.team || event.lag,
      description: event.description || event.beskrivelse
    };
    
    // Handle player information with jersey numbers (draktnummer)
    if (event.player || event.spiller) {
      const player = event.player || event.spiller;
      processed.player = {
        name: player.name || player.navn || player.fullName,
        number: player.draktnummer || player.number || event.draktnummer || event.number
      };
    }
    
    // Handle substitutions with both players and their draktnummer
    if (event.playerIn || event.spillerInn || event.substitute) {
      const playerIn = event.playerIn || event.spillerInn || event.substitute;
      processed.playerIn = {
        name: playerIn.name || playerIn.navn || playerIn.fullName,
        number: playerIn.draktnummer || playerIn.number
      };
    }
    
    if (event.playerOut || event.spillerUt || event.substituted) {
      const playerOut = event.playerOut || event.spillerUt || event.substituted;
      processed.playerOut = {
        name: playerOut.name || playerOut.navn || playerOut.fullName,
        number: playerOut.draktnummer || playerOut.number
      };
    }
    
    // Handle additional event data
    if (event.additionalInfo || event.tilleggsinfo) {
      processed.additionalInfo = event.additionalInfo || event.tilleggsinfo;
    }
    
    return processed;
  });
}

function mapEventType(apiType) {
  const typeMap = {
    // Standard engelsk/norsk mapping
    'goal': 'goal',
    'maal': 'goal',
    'scoring': 'goal',
    'yellow_card': 'yellow',
    'gult_kort': 'yellow',
    'yellow': 'yellow',
    'red_card': 'red',
    'rodt_kort': 'red', 
    'red': 'red',
    'substitution': 'substitution',
    'innbytte': 'substitution',
    'sub': 'substitution',
    'corner': 'corner',
    'hjornespark': 'corner',
    'free_kick': 'free_kick',
    'frispark': 'free_kick',
    'penalty': 'penalty',
    'straffespark': 'penalty',
    'penalty_goal': 'penalty',
    'offside': 'offside',
    'offside': 'offside',
    'own_goal': 'own-goal',
    'selvmaal': 'own-goal',
    'booking': 'yellow',
    'sending_off': 'red'
  };
  
  return typeMap[apiType?.toLowerCase()] || apiType || 'unknown';
}
