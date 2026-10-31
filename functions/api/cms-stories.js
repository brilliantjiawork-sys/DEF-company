const REPOSITORY = 'brilliantjiawork-sys/DEF-company';
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPOSITORY}/main/data/database.json`;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate'
    }
  });
}

export async function onRequestGet() {
  try {
    const upstream = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, {
      headers: { 'cache-control': 'no-cache' }
    });
    if (!upstream.ok) {
      return jsonResponse({ ok: false, error: `Story manifest returned ${upstream.status}` }, 502);
    }

    const manifest = await upstream.json();
    const articles = Array.isArray(manifest.articles) ? manifest.articles : [];
    const entries = articles
      .filter(article => article && typeof article === 'object' && article.slug)
      .map(article => ({
        slug: String(article.slug),
        title: article.title || article.name || String(article.slug).replace(/[-_]+/g, ' '),
        date: article.date || article.publish_date || article.published_date || '',
        category: article.category || '',
        status: 'Published',
        url: `#/collections/stories/entries/${encodeURIComponent(String(article.slug))}`
      }));

    return jsonResponse({ ok: true, entries });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : 'Unable to read Story manifest'
    }, 502);
  }
}
