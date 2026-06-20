module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  function decodeEntities(str) {
    return str.replace(/&#038;/g, '&').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'").replace(/&#8211;/g, '–').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
  }

  function extractItemsAfterHeading(html, headingText) {
    const headingRegex = new RegExp('<h2[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>' + headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<\\/h2>', 'i');
    const hMatch = headingRegex.exec(html);
    if (!hMatch) return [];

    const afterHeading = html.slice(hMatch.index + hMatch[0].length);

    // Find the posts container after this heading
    const classIdx = afterHeading.indexOf('elementor-posts-container');
    if (classIdx === -1) return [];

    // Go back to find the opening <div> of this container
    const containerStart = afterHeading.lastIndexOf('<div', classIdx);
    if (containerStart === -1) return [];

    // Find the closing </div> of the elementor-widget-container that wraps the posts
    // We need to match the right depth level
    let depth = 1;
    let containerEnd = containerStart + 4;
    while (depth > 0 && containerEnd < afterHeading.length) {
      if (afterHeading[containerEnd] === '<') {
        if (afterHeading[containerEnd + 1] === '/' && afterHeading.slice(containerEnd + 2, containerEnd + 6) === 'div>') {
          depth--;
          containerEnd += 6;
        } else if (afterHeading.slice(containerEnd + 1, containerEnd + 5) === 'div ') {
          depth++;
          containerEnd += 4;
        } else if (afterHeading.slice(containerEnd + 1, containerEnd + 5) === 'div>') {
          depth--;
          containerEnd += 5;
        }
      }
      containerEnd++;
      if (containerEnd > afterHeading.length) break;
    }

    const containerHtml = afterHeading.slice(containerStart, containerEnd);

    const items = [];
    const titleRegex = /<h3 class="elementor-post__title">\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/g;
    let tm;
    while ((tm = titleRegex.exec(containerHtml)) !== null) {
      const url = tm[1].trim();
      const text = tm[2].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
      if (text && text.length > 5) items.push({ text: decodeEntities(text), url });
    }

    return items;
  }

  try {
    const response = await fetch('https://onlineupdatestm.in/', {
      signal: AbortSignal.timeout(15000)
    });
    const html = await response.text();

    const result = extractItemsAfterHeading(html, 'Results');
    const admitCard = extractItemsAfterHeading(html, 'Admit Card');
    const latestJob = extractItemsAfterHeading(html, 'Latest Jobs');

    return res.json({
      result: result.slice(0, 25),
      admitCard: admitCard.slice(0, 25),
      latestJob: latestJob.slice(0, 25),
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
