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

    const villageKeywords = [
      'pension', 'kisan', 'yojna', 'yojana', 'farmer', 'kisaan',
      'pm ', 'pradhanmantri', 'awas', 'housing', 'ladli', 'behan', 'nari',
      'ration', 'food ', 'free', 'scholarship', 'chhatravritti',
      'subsidy', 'bijli', 'electricity', 'jal ', 'water', 'health',
      'ayushman', 'employment', 'rozgar', 'gramin', 'rural',
      'shramik', 'labour', 'social security', 'samajik',
      'prayog', 'portal', 'online apply', 'form'
    ];

    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1].trim();
      let inner = match[2].replace(/<[^>]*>/g, '').trim();

      if (!inner) continue;

      const lower = inner.toLowerCase();
      if (
        lower.length > 5 && lower.length < 200 &&
        !lower.includes('home') && !lower.includes('privacy') &&
        !lower.includes('contact') && !lower.includes('disclaimer') &&
        !lower.includes('login') && !lower.includes('sign up') &&
        villageKeywords.some(k => lower.includes(k))
      ) {
        const absUrl = href.startsWith('http') ? href : href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href;
        const key = absUrl + '|' + inner;
        if (!seen.has(key)) {
          seen.add(key);
          updates.push({ title: inner, url: absUrl });
        }
      }
      if (updates.length >= 10) break;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json({
      updates: sliced,
      fetchedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });
  } catch (e) {
    res.status(200).json({ updates: [], fetchedAt: null });
  }
}
