module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  function decodeEntities(str) {
    return str
      .replace(/&#038;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&#8211;/g, '–')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&nbsp;/g, ' ');
  }

  async function fetchGoogleNewsFeed(query) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return [];
      const text = await response.text();

      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title>([\s\S]*?)<\/title>/i;
      const linkRegex = /<link>([\s\S]*?)<\/link>/i;

      let match;
      while ((match = itemRegex.exec(text)) !== null && items.length < 20) {
        const itemContent = match[1];
        const titleMatch = titleRegex.exec(itemContent);
        const linkMatch = linkRegex.exec(itemContent);
        if (titleMatch && linkMatch) {
          let title = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/i, '$1').trim();
          let link = linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/i, '$1').trim();
          title = decodeEntities(title);
          link = decodeEntities(link);
          items.push({ text: title, url: link });
        }
      }
      return items;
    } catch (e) {
      console.error(`[News Scraping] Error for query "${query}":`, e);
      return [];
    }
  }

  try {
    const resultsNewsPromise = fetchGoogleNewsFeed('("exam result" OR "board result" OR "recruitment result" OR "admission result" OR "Sarkari Result")');
    const schemesNewsPromise = fetchGoogleNewsFeed('"government scheme" OR "yojana" OR "PM Kisan" OR "Ration Card" OR "PAN card"');
    const jobsNewsPromise = fetchGoogleNewsFeed('"recruitment" OR "govt job" OR "sarkari naukri" OR "job vacancy"');

    const [resultsNews, schemesNews, jobsNews] = await Promise.all([
      resultsNewsPromise,
      schemesNewsPromise,
      jobsNewsPromise
    ]);

    return res.json({
      result: resultsNews,      // Maps to first column (Result)
      admitCard: schemesNews,   // Maps to second column (Admit Card)
      latestJob: jobsNews,      // Maps to third column (Latest Job)
      lastUpdated: Date.now()
    });
  } catch (e) {
    return res.status(200).json({
      result: [],
      admitCard: [],
      latestJob: [],
      lastUpdated: 0,
      error: e.message
    });
  }
};
