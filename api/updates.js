const BASE = 'https://www.sarkariresult.com';

export default async function handler(req, res) {
  try {
    const resp = await fetch(BASE);
    const html = await resp.text();

    const updates = [];
    const baseUrl = BASE.replace(/\/+$/, '');

    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    const seen = new Set();

    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1].trim();
      let inner = match[2].replace(/<[^>]*>/g, '').trim();

      if (!inner) continue;

      const lower = inner.toLowerCase();
      if (
        (lower.includes('result') || lower.includes('answer') || lower.includes('admit') ||
         lower.includes('scheme') || lower.includes('apply') || lower.includes('exam') ||
         lower.includes('recruitment') || lower.includes('vacancy') || lower.includes('syllabus') ||
         lower.includes(' merit') || lower.includes('cutoff') || lower.includes('scam') ||
         lower.includes('latest') || lower.includes(' update') || lower.includes('notice') ||
         lower.includes('interview') || lower.includes('allotment') || lower.includes('counselling') ||
         lower.includes('admission') || lower.includes('registration')) &&
        !lower.includes('home') && !lower.includes('privacy') && !lower.includes('about') &&
        !lower.includes('contact') && !lower.includes('disclaimer') && !lower.includes('login') &&
        !lower.includes('sign up') && !lower.includes('register') &&
        inner.length > 5 && inner.length < 200
      ) {
        const absUrl = href.startsWith('http') ? href : href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href;
        const key = absUrl + '|' + inner;
        if (!seen.has(key)) {
          seen.add(key);
          updates.push({ title: inner, url: absUrl });
        }
      }
    }

    updates.sort((a, b) => a.title.localeCompare(b.title));
    const sliced = updates.slice(0, 15);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json({
      updates: sliced,
      fetchedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });
  } catch (e) {
    res.status(200).json({ updates: [], fetchedAt: null });
  }
}
