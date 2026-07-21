// Google Search Console, YOUR data, YOUR OAuth token, from .env.
//
// This is the half of the picture no model has: what people actually typed to
// reach your site, and where you actually rank. Everything the agent proposes is
// anchored here. Without it you are guessing, only faster.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/webmasters/v3'

let cached = { token: null, expires: 0 }

async function accessToken() {
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Search Console is not connected. Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ' +
        'GOOGLE_REFRESH_TOKEN in .env, run `npm run connect` to get the refresh token.',
    )
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`)
  const d = await res.json()
  cached = { token: d.access_token, expires: Date.now() + d.expires_in * 1000 }
  return cached.token
}

function siteUrl() {
  const s = process.env.SITE_URL
  if (!s) throw new Error('SITE_URL is not set in .env (e.g. "sc-domain:example.com" or "https://example.com/").')
  return s
}

const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

async function query(body) {
  const token = await accessToken()
  const res = await fetch(`${API}/sites/${encodeURIComponent(siteUrl())}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    if (res.status === 403) throw new Error(`Search Console said 403. Is ${siteUrl()} a property on the Google account you connected? Raw: ${t}`)
    throw new Error(`Search Console error ${res.status}: ${t}`)
  }
  return (await res.json()).rows ?? []
}

/**
 * The workhorse. Four views on the same 90 days.
 *
 * - "queries"           what people search, where you rank
 * - "pages"             which of your pages earn anything
 * - "striking_distance" position 8-20: you are ON page 1-2 already. Cheapest wins
 *                       on the whole board. This is where you start, always.
 * - "ctr_gap"           good position, terrible click rate. The page ranks and
 *                       nobody clicks. Usually a title/meta problem, not a content one.
 */
export async function gscRankings({ type = 'queries', days = 90, limit = 100 } = {}) {
  const range = { startDate: day(days), endDate: day(2) }

  if (type === 'pages') {
    const rows = await query({ ...range, dimensions: ['page'], rowLimit: limit })
    return rows.map((r) => ({
      url: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: +(r.ctr * 100).toFixed(2),
      position: +r.position.toFixed(1),
    }))
  }

  const rows = await query({ ...range, dimensions: ['query'], rowLimit: 1000 })
  const mapped = rows.map((r) => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: +(r.ctr * 100).toFixed(2),
    position: +r.position.toFixed(1),
  }))

  if (type === 'striking_distance') {
    return mapped
      .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit)
  }
  if (type === 'ctr_gap') {
    return mapped
      .filter((r) => r.position <= 10 && r.impressions >= 50 && r.ctr < 2)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit)
  }
  return mapped.sort((a, b) => b.impressions - a.impressions).slice(0, limit)
}

/** Every page Search Console has ever shown for you. One of the four coverage sources. */
export async function gscPages(days = 90) {
  const rows = await query({
    startDate: day(days),
    endDate: day(2),
    dimensions: ['page'],
    rowLimit: 1000,
  })
  return rows.map((r) => ({
    url: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    source: 'gsc',
  }))
}

export async function gscSummary(days = 90) {
  const rows = await query({ startDate: day(days), endDate: day(2), dimensions: [], rowLimit: 1 })
  const r = rows[0]
  if (!r) return { days, clicks: 0, impressions: 0, ctr: 0, position: null, note: 'No Search Console data in this window yet.' }
  return {
    days,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: +(r.ctr * 100).toFixed(2),
    position: +r.position.toFixed(1),
  }
}
