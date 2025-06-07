exports.handler = async (event, context) => {
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

  const { type, clubid, cid, cwd, count } = event.queryStringParameters || {};

  if (!type || !clubid || !cid || !cwd) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Mangler påkrevde parametere: type, clubid, cid, cwd' })
    };
  }

  try {
    const url = `http://api.fotballdata.no/js.fd?type=${type}&clubid=${clubid}&cid=${cid}&cwd=${cwd}&format=json${count ? `&count=${count}` : ''}`;
    const response = await fetch(url);
    const jsCode = await response.text();

    function parseJavaScriptToHtml(jsCode) {
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

    function parseMatchesFromHtml(html) {
      const matches = [];
      const liPattern = /<li>(.*?)<\/li>/gs;
      let liMatch;

      while ((liMatch = liPattern.exec(html)) !== null) {
        const liContent = liMatch[1];
        const dateTimePattern = /<a[^>]*>([^<]*\d+\.\d+\.\d*)<\/a>\s*kl\s*(\d+:\d+)/;
        const dateTimeMatch = liContent.match(dateTimePattern);
        if (dateTimeMatch) {
          const date = dateTimeMatch[1].trim();
          const time = dateTimeMatch[2];
          const tournamentPattern = /<a[^>]*title='Se mer om turneringen[^>]*>([^<]+)<\/a>/;
          const tournamentMatch = liContent.match(tournamentPattern);
          const tournament = tournamentMatch ? tournamentMatch[1].trim() : '';
          let homeTeam = '', awayTeam = '', venue = '';
          const teamLinkPattern = /<a[^>]*title='Se mer om laget[^>]*>([^<]+)<\/a>/g;
          const teamMatches = [...liContent.matchAll(teamLinkPattern)];

          if (liContent.includes('>hjemme</a> mot')) {
            if (teamMatches.length >= 2) {
              homeTeam = teamMatches[0][1].trim();
              awayTeam = teamMatches[1][1].trim();
              venue = 'Hjemme';
            }
          } else if (liContent.includes('>borte</a> mot')) {
            if (teamMatches.length >= 2) {
              awayTeam = teamMatches[0][1].trim();
              homeTeam = teamMatches[1][1].trim();
              venue = 'Borte';
            }
          } else if (teamMatches.length >= 1) {
            homeTeam = teamMatches[0][1] || 'Ekholt';
            awayTeam = teamMatches[1]?.[1] || 'TBD';
            venue = 'TBD';
          }

          const resultPattern = /(\d+-\d+)/;
          const resultMatch = liContent.match(resultPattern);
          const result = resultMatch ? resultMatch[1] : '';

          const parsedDate = parseNorwegianDate(date);

          matches.push({
            date,
            time,
            homeTeam,
            awayTeam,
            venue,
            tournament,
            result: result || undefined,
            parsedDate
          });
        }
      }
      return matches;
    }

    function parseNorwegianDate(dateStr) {
      const dateMatch = dateStr.match(/(\d+)\.(\d+)\.(\d+)/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        let year = parseInt(dateMatch[3]);
        if (year < 100) year += 2000;
        return new Date(year, month - 1, day);
      }
      return new Date();
    }

    const html = parseJavaScriptToHtml(jsCode);
    const allMatches = parseMatchesFromHtml(html);
    const filteredMatches = allMatches; // Filtrering deaktivert

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        success: true,
        type,
        clubId: clubid,
        matches: filteredMatches,
        totalMatches: filteredMatches.length,
        totalFound: allMatches.length,
        filters: {},
        lastUpdated: new Date().toISOString(),
        clubLogo: `https://logo.fotballdata.no/logos/${clubid}.jpg?w=120`
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Feil ved henting av fotballdata: ' + error.message })
    };
  }
};
