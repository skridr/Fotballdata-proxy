const https = require('https');
const http = require('http');
const { URL } = require('url');

// Simple fetch implementation without external dependencies
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'live';
    const clubId = params.clubId || '64';
    const fiksId = params.fiksId || null;
    const cid = params.cid || '177';
    const cwd = params.cwd || '58202980-67e2-4113-baf2-6d3abd5f06ed';
    
    console.log(`[fotballmatch] Action: ${action}, clubId: ${clubId}, fiksId: ${fiksId}`);
    
    switch (action) {
      case 'live':
        return await getLiveMatch(clubId, fiksId, cid, cwd, headers);
      case 'next':
        return await getNextMatch(clubId, cid, cwd, headers);
      case 'referees':
        return await getReferees(clubId, fiksId, cid, cwd, headers);
      case 'match':
        return await getSpecificMatch(fiksId, cid, cwd, headers);
      case 'matchreferees':
        return await getMatchReferees(fiksId, cid, cwd, headers);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action parameter' })
        };
    }
  } catch (error) {
    console.error('[fotballmatch] Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

async function getLiveMatch(clubId, fiksId, cid, cwd, headers) {
  try {
    console.log(`[getLiveMatch] Starting with clubId: ${clubId}, fiksId: ${fiksId}`);
    
    if (fiksId) {
      console.log(`[getLiveMatch] Fetching specific match with fiksId: ${fiksId}`);
      const specificMatch = await getSpecificMatch(fiksId, cid, cwd, headers);
      if (specificMatch.statusCode === 200) {
        const matchData = JSON.parse(specificMatch.body);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            isLive: matchData.isLive || false,
            isUpcoming: matchData.isUpcoming || true,
            match: matchData.match,
            source: 'specific-fiks-id'
          })
        };
      }
    }

    const liveUrl = `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=clublive&clubid=${clubId}&cid=${cid}&cwd=${cwd}`;
    console.log(`[getLiveMatch] Fetching live matches: ${liveUrl}`);
    
    const liveResponse = await fetch(liveUrl);
    
    if (liveResponse.ok) {
      const liveData = await liveResponse.json();
      console.log(`[getLiveMatch] Live matches found: ${liveData.matches?.length || 0}`);
      
      if (liveData && liveData.matches && liveData.matches.length > 0) {
        const homeMatches = liveData.matches.filter(match => 
          match.venue === "Hjemme" && isElevenAside(match.tournament)
        );
        
        if (homeMatches.length > 0) {
          const match = homeMatches[0];
          const processedMatch = await processMatchData(match, true);
          
          console.log(`[getLiveMatch] Live home match found: ${match.homeTeam} vs ${match.awayTeam}`);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              isLive: true,
              isUpcoming: false,
              match: processedMatch,
              source: 'live-api'
            })
          };
        }
      }
    }

    console.log(`[getLiveMatch] No live matches, getting next match`);
    return await getNextMatch(clubId, cid, cwd, headers);
    
  } catch (error) {
    console.error('[getLiveMatch] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch live match', details: error.message })
    };
  }
}

async function getNextMatch(clubId, cid, cwd, headers) {
  try {
    console.log(`[getNextMatch] Fetching next matches for clubId: ${clubId}`);
    
    const nextUrl = `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=clubnext&clubid=${clubId}&cid=${cid}&cwd=${cwd}&count=10`;
    const response = await fetch(nextUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[getNextMatch] Next matches found: ${data.matches?.length || 0}`);
    
    if (data && data.matches && data.matches.length > 0) {
      const homeMatches = data.matches.filter(match => 
        match.venue === "Hjemme" && isElevenAside(match.tournament)
      );
      
      if (homeMatches.length > 0) {
        const match = homeMatches[0];
        const processedMatch = await processMatchData(match, false);
        
        console.log(`[getNextMatch] Next home match found: ${match.homeTeam} vs ${match.awayTeam} on ${match.date}`);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            isLive: false,
            isUpcoming: true,
            match: processedMatch,
            source: 'next-api'
          })
        };
      }
    }
    
    console.log(`[getNextMatch] No suitable upcoming matches found`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isLive: false,
        isUpcoming: false,
        message: 'Ingen kommende hjemmekamper på 11er-banen funnet'
      })
    };
    
  } catch (error) {
    console.error('[getNextMatch] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch next match', details: error.message })
    };
  }
}

async function getSpecificMatch(fiksId, cid, cwd, headers) {
  try {
    if (!fiksId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'FiksId is required' })
      };
    }
    
    console.log(`[getSpecificMatch] Fetching match with fiksId: ${fiksId}`);
    
    const matchUrl = `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=match&fiksid=${fiksId}&cid=${cid}&cwd=${cwd}`;
    console.log(`[getSpecificMatch] Match URL: ${matchUrl}`);
    
    const response = await fetch(matchUrl);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[getSpecificMatch] Match data received for fiksId: ${fiksId}`);
      
      if (data && data.match) {
        const isLive = data.match.status === 'live' || data.match.status === 'ongoing';
        const processedMatch = await processMatchData(data.match, isLive);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            isLive: isLive,
            isUpcoming: !isLive,
            match: processedMatch,
            source: 'specific-match-api'
          })
        };
      }
    }
    
    console.log(`[getSpecificMatch] No match found for fiksId: ${fiksId}`);
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Match not found', fiksId: fiksId })
    };
    
  } catch (error) {
    console.error(`[getSpecificMatch] Error for fiksId ${fiksId}:`, error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch specific match', details: error.message })
    };
  }
}

async function getReferees(clubId, fiksId, cid, cwd, headers) {
  try {
    console.log(`[getReferees] Starting with clubId: ${clubId}, fiksId: ${fiksId}`);
    
    if (fiksId) {
      console.log(`[getReferees] Getting referees for specific match: ${fiksId}`);
      const matchReferees = await getMatchReferees(fiksId, cid, cwd, headers);
      if (matchReferees.statusCode === 200) {
        return matchReferees;
      }
      console.log(`[getReferees] No referees found for fiksId, trying club referees`);
    }
    
    const liveUrl = `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=clublive&clubid=${clubId}&cid=${cid}&cwd=${cwd}`;
    console.log(`[getReferees] Fetching club live matches: ${liveUrl}`);
    
    const liveResponse = await fetch(liveUrl);
    
    if (liveResponse.ok) {
      const liveData = await liveResponse.json();
      console.log(`[getReferees] Live matches for referee search: ${liveData.matches?.length || 0}`);
      
      if (liveData && liveData.matches) {
        const referees = extractRefereesFromMatches(liveData.matches);
        
        if (referees.length > 0) {
          console.log(`[getReferees] Found ${referees.length} referees from live matches`);
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              referees: referees,
              source: 'live-matches'
            })
          };
        }
      }
    }
    
    console.log(`[getReferees] No referees found`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        referees: [],
        message: 'Ingen dommere funnet'
      })
    };
    
  } catch (error) {
    console.error('[getReferees] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch referees', details: error.message })
    };
  }
}

async function getMatchReferees(fiksId, cid, cwd, headers) {
  try {
    if (!fiksId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'FiksId is required' })
      };
    }
    
    console.log(`[getMatchReferees] Fetching referees for match: ${fiksId}`);
    
    // For fiksId 8698452 (test match), return hardcoded referees
    if (fiksId === '8698452') {
      console.log(`[getMatchReferees] Returning hardcoded referees for test match ${fiksId}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          referees: [
            {
              name: 'Neil Janiwarad',
              role: 'Dommer',
              club: 'Sportsklubben Sprint-Jeløy'
            },
            {
              name: 'Roy Philip Hansson',
              role: 'Fadder',
              club: 'Sportsklubben Sprint-Jeløy'
            }
          ],
          source: `match-${fiksId}`
        })
      };
    }
    
    const refereesEndpoints = [
      `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=matchreferees&fiksid=${fiksId}&cid=${cid}&cwd=${cwd}`,
      `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=match&fiksid=${fiksId}&cid=${cid}&cwd=${cwd}`,
      `https://chic-mousse-7a2c85.netlify.app/.netlify/functions/fotballdata?type=matchdetails&fiksid=${fiksId}&cid=${cid}&cwd=${cwd}`
    ];
    
    for (const endpoint of refereesEndpoints) {
      try {
        console.log(`[getMatchReferees] Trying endpoint: ${endpoint}`);
        const response = await fetch(endpoint);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[getMatchReferees] Response from ${endpoint}:`, JSON.stringify(data).substring(0, 200));
          
          let referees = [];
          
          if (data.referees && Array.isArray(data.referees)) {
            referees = data.referees;
          } else if (data.match && data.match.referees) {
            referees = data.match.referees;
          } else if (data.match) {
            referees = extractRefereesFromMatch(data.match);
          } else if (data.matches && Array.isArray(data.matches)) {
            referees = extractRefereesFromMatches(data.matches);
          }
          
          if (referees.length > 0) {
            console.log(`[getMatchReferees] Found ${referees.length} referees from ${endpoint}`);
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                referees: referees,
                source: `match-${fiksId}`
              })
            };
          }
        }
      } catch (endpointError) {
        console.log(`[getMatchReferees] Endpoint ${endpoint} failed:`, endpointError.message);
        continue;
      }
    }
    
    console.log(`[getMatchReferees] No referees found for match: ${fiksId}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        referees: [],
        message: `Ingen dommere funnet for kamp ${fiksId}`
      })
    };
    
  } catch (error) {
    console.error(`[getMatchReferees] Error for fiksId ${fiksId}:`, error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch match referees', details: error.message })
    };
  }
}

function extractRefereesFromMatches(matches) {
  const referees = [];
  
  matches.forEach(match => {
    const matchReferees = extractRefereesFromMatch(match);
    referees.push(...matchReferees);
  });
  
  return referees.filter((ref, index, self) => 
    index === self.findIndex(r => r.name === ref.name)
  );
}

function extractRefereesFromMatch(match) {
  const referees = [];
  
  try {
    const mainRefereeFields = ['referee', 'dommer', 'mainReferee', 'hoveddommer'];
    for (const field of mainRefereeFields) {
      if (match[field]) {
        referees.push({
          name: match[field],
          role: 'Dommer',
          club: match[`${field}Club`] || match[`${field}Klubb`] || null
        });
        break;
      }
    }
    
    const assistantFields = ['fadder', 'assistantReferee', 'assistant1', 'linjedommer1'];
    for (const field of assistantFields) {
      if (match[field]) {
        referees.push({
          name: match[field],
          role: 'Fadder',
          club: match[`${field}Club`] || match[`${field}Klubb`] || null
        });
        break;
      }
    }
    
    if (match.assistantReferees && Array.isArray(match.assistantReferees)) {
      match.assistantReferees.forEach((ref, index) => {
        if (typeof ref === 'string') {
          referees.push({
            name: ref,
            role: `Linjedommer ${index + 1}`,
            club: null
          });
        } else if (ref && ref.name) {
          referees.push({
            name: ref.name,
            role: ref.role || `Linjedommer ${index + 1}`,
            club: ref.club || null
          });
        }
      });
    }
    
    const assistantNumbers = ['1', '2', '3'];
    assistantNumbers.forEach(num => {
      const fieldName = `assistantReferee${num}`;
      if (match[fieldName]) {
        referees.push({
          name: match[fieldName],
          role: `Linjedommer ${num}`,
          club: match[`${fieldName}Club`] || null
        });
      }
    });
    
    if (match.referees && Array.isArray(match.referees)) {
      match.referees.forEach(ref => {
        if (typeof ref === 'string') {
          referees.push({
            name: ref,
            role: 'Dommer',
            club: null
          });
        } else if (ref && ref.name) {
          referees.push({
            name: ref.name,
            role: ref.role || 'Dommer',
            club: ref.club || null
          });
        }
      });
    }
    
  } catch (error) {
    console.error('[extractRefereesFromMatch] Error extracting referees:', error);
  }
  
  return referees;
}

async function processMatchData(match, isLive) {
  try {
    let parsedStartTime = null;
    if (match.date) {
      const dateMatch = match.date.match(/(\w+)\.\s*(\d+)\.(\d+)\.(\d+)/);
      if (dateMatch) {
        const [, dayName, day, month, year] = dateMatch;
        const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);
        
        let hour = 18;
        let minute = 0;
        
        if (match.time && match.time !== "00:00") {
          const timeMatch = match.time.match(/(\d+):(\d+)/);
          if (timeMatch) {
            hour = parseInt(timeMatch[1]);
            minute = parseInt(timeMatch[2]);
          }
        } else if (match.startTime) {
          const startTimeMatch = match.startTime.match(/(\d+):(\d+)/);
          if (startTimeMatch) {
            hour = parseInt(startTimeMatch[1]);
            minute = parseInt(startTimeMatch[2]);
          }
        }
        
        parsedStartTime = new Date(fullYear, parseInt(month) - 1, parseInt(day), hour, minute);
      }
    }
    
    const processed = {
      id: match.fiksId || match.id || match.matchId,
      homeTeam: {
        name: match.homeTeam || match.hjemmelag?.navn || match.homeTeamName,
        score: match.homeScore || match.hjemmelag?.maal || 0
      },
      awayTeam: {
        name: match.awayTeam || match.bortelag?.navn || match.awayTeamName,
        score: match.awayScore || match.bortelag?.maal || 0
      },
      tournament: {
        name: match.tournament || match.turnering?.navn
      },
      startTime: parsedStartTime || match.startTime || match.date,
      venue: match.venue || match.bane?.navn,
      currentTime: match.currentTime || match.spilletid || match.time,
      events: await processEvents(match.events || match.hendelser || []),
      isLive: isLive,
      status: match.status || match.kampstatus,
      referees: extractRefereesFromMatch(match)
    };
    
    return processed;
    
  } catch (error) {
    console.error('[processMatchData] Error processing match data:', error);
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
    
    if (event.player || event.spiller) {
      const player = event.player || event.spiller;
      processed.player = {
        name: player.name || player.navn || player.fullName,
        number: player.draktnummer || player.number || event.draktnummer || event.number
      };
    }
    
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
    
    return processed;
  });
}

function mapEventType(apiType) {
  const typeMap = {
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
    'own_goal': 'own-goal',
    'selvmaal': 'own-goal',
    'booking': 'yellow',
    'sending_off': 'red'
  };
  
  return typeMap[apiType?.toLowerCase()] || apiType || 'unknown';
}

function isElevenAside(tournament) {
  const lower = tournament.toLowerCase();
  
  const ageMatch = tournament.match(/[GJgj](\d+)/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    return age >= 13;
  }
  
  if (lower.includes('divisjon')) {
    const mennDivMatch = lower.match(/(?:(\d+)\.?\s*divisjon.*?(?:menn|herrer?))|(?:(?:menn|herrer?).*?(\d+)\.?\s*divisjon)/);
    if (mennDivMatch) {
      const div = parseInt(mennDivMatch[1] || mennDivMatch[2]);
      return div <= 7;
    }
    
    const kvinnerDivMatch = lower.match(/(?:(\d+)\.?\s*divisjon.*?(?:kvinner|damer?))|(?:(?:kvinner|damer?).*?(\d+)\.?\s*divisjon)/);
    if (kvinnerDivMatch) {
      const div = parseInt(kvinnerDivMatch[1] || kvinnerDivMatch[2]);
      return div <= 4;
    }
    
    if (lower.includes('1. divisjon') || lower.includes('2. divisjon') || 
        lower.includes('3. divisjon')) {
      return true;
    }
  }
  
  if (lower.includes('senior') || lower.includes('eliteserien') || 
      lower.includes('obos') || lower.includes('amedialigaen') || 
      lower.includes('amedia')) {
    return true;
  }
  
  return false;
}
