// DataForSEO, YOUR account, YOUR credentials, from .env.
//
// Search Console tells you what you ALREADY rank for. It cannot tell you what
// nobody has found yet, how much demand a topic actually has, or who is already
// winning it. That is what this is for. The two together are the difference
// between a proposal and a guess.
//
// These calls cost real money (fractions of a cent, but real). Every function
// here is a single, explicit call. Nothing fans out behind your back.

const API = 'https://api.dataforseo.com/v3'

function auth() {
  const { DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD } = process.env
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    throw new Error(
      'DataForSEO is not configured. Put DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env. ' +
        'Without it the agent cannot check search volume, and a topic with no demand is not a topic.',
    )
  }
  return 'Basic ' + Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64')
}

// Your market, not a silent US default.
//
// This is not a nicety. In production, eleven of twelve projects once ran on the
// silent US/en fallback because nobody had set the market. German keywords came
// back with volume 0, seeds landed on US SERPs, and the volume criterion quietly
// starved. Nothing crashed. Everything "worked". The results were garbage.
function market() {
  const loc = Number(process.env.DATAFORSEO_LOCATION_CODE || 2276) // 2276 = Germany
  const lang = process.env.DATAFORSEO_LANGUAGE_CODE || 'de'
  return { location_code: loc, language_code: lang }
}

async function post(path, task) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ ...market(), ...task }]),
  })
  if (!res.ok) throw new Error(`DataForSEO ${path} -> ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const t = json.tasks?.[0]
  if (t?.status_code >= 40000) {
    throw new Error(`DataForSEO ${path}: ${t.status_message} (code ${t.status_code})`)
  }
  return t?.result ?? []
}

/**
 * Real Google Ads search volume. This is the WHETHER gate:
 * a keyword nobody searches is not worth a page, however good the page is.
 */
export async function keywordVolume(keywords) {
  const result = await post('/keywords_data/google_ads/search_volume/live', {
    keywords: keywords.slice(0, 100),
  })
  return (result ?? [])
    .map((r) => ({
      keyword: r.keyword,
      volume: r.search_volume ?? 0,
      cpc: r.cpc ?? null,
      competition: r.competition_index ?? null,
      // The floor is a judgement call, not a law. Below roughly 40 a month, a
      // dedicated page rarely pays for the effort of maintaining it.
      meets_threshold: (r.search_volume ?? 0) >= Number(process.env.VOLUME_FLOOR || 40),
    }))
    .sort((a, b) => b.volume - a.volume)
}

/**
 * Who is actually on page 1 for this, and what does the SERP look like?
 *
 * Two things matter here and neither is the ranking list:
 *  - featured snippet / AI overview present: your click-through will be worse
 *    than the position suggests. Zero-click risk.
 *  - who ranks: if the whole page is Wikipedia and government sites, you are
 *    not going to win it with a blog post, whatever the volume says.
 */
export async function competitorKeywords(keyword) {
  const result = await post('/serp/google/organic/live/advanced', {
    keyword,
    depth: 20,
  })
  const items = result?.[0]?.items ?? []
  const organic = items.filter((i) => i.type === 'organic')
  return {
    keyword,
    ai_overview_present: items.some((i) => i.type === 'ai_overview'),
    featured_snippet_present: items.some((i) => i.type === 'featured_snippet'),
    people_also_ask: items.some((i) => i.type === 'people_also_ask'),
    paid_count: items.filter((i) => i.type === 'paid').length,
    results: organic.slice(0, 10).map((i, idx) => ({
      position: idx + 1,
      domain: i.domain,
      title: i.title,
      url: i.url,
    })),
  }
}

/** Keyword difficulty, in bulk. Cheap way to kill unwinnable ideas before you research them. */
export async function keywordDifficulty(keywords) {
  const result = await post('/dataforseo_labs/google/bulk_keyword_difficulty/live', {
    keywords: keywords.slice(0, 100),
  })
  return (result?.[0]?.items ?? []).map((r) => ({
    keyword: r.keyword,
    difficulty: r.keyword_difficulty,
  }))
}
