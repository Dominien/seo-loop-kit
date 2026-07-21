// The coverage gate.
//
// This exists because of a real incident. A find pass once filed ten
// "write a new article" tasks, and every single one of them already existed as a
// live, traffic-carrying page. One of them had 564 clicks. The agent had done
// exactly what it was told: it deduped against the BOARD. Nobody had told it to
// dedupe against the SITE.
//
// The lesson is the whole point of this kit:
//
//   "The agent must check the sitemap first" is not enforceable as a prompt
//   instruction. Agents forget. Make it mechanical.
//
// So this is not advice the model may weigh. It throws.

import { createHmac, randomBytes } from 'node:crypto'

// One process-lifetime secret. The inventory ref is a signed, stateless token:
// it proves the agent CALLED get_content_inventory before filing content work.
// It deliberately does not bind the exact URL list. The discipline of having
// looked is what is enforced, not a checksum of what it saw.
const SECRET = randomBytes(32)
const HOUR = 3600_000

export function mintRef() {
  const bucket = Math.floor(Date.now() / HOUR)
  const sig = createHmac('sha256', SECRET).update(String(bucket)).digest('hex').slice(0, 16)
  return `inv_${sig}`
}

export function verifyRef(ref) {
  if (!ref || typeof ref !== 'string') return false
  const now = Math.floor(Date.now() / HOUR)
  // Current and previous bucket, so a ref stays valid for roughly 1-2 hours.
  for (const bucket of [now, now - 1]) {
    const sig = createHmac('sha256', SECRET).update(String(bucket)).digest('hex').slice(0, 16)
    if (ref === `inv_${sig}`) return true
  }
  return false
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function lastSegment(url) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '')
    return p.split('/').filter(Boolean).pop() ?? ''
  } catch {
    return ''
  }
}

/**
 * Does the site already have a page for this keyword?
 *
 * Deterministic: slugify the keyword, match it against the last path segment of
 * every page we know about, exact or hyphen-bounded. No model judgement.
 *
 * @param {string} keyword
 * @param {Array<{url: string, clicks?: number, impressions?: number, source?: string}>} pages
 * @returns {{url: string, clicks: number, impressions: number, source: string} | null}
 */
export function findSlugCoverage(keyword, pages) {
  const slug = slugify(keyword)
  // Very short slugs match everything. Skip them rather than block real work.
  if (slug.length < 5) return null

  for (const p of pages) {
    const seg = lastSegment(p.url)
    if (!seg) continue
    if (seg === slug) return { ...p, matched: slug }
    // hyphen-bounded: "satz-des-pythagoras" covers "pythagoras" only if it is a
    // whole hyphen-delimited run, not a substring of another word.
    const parts = seg.split('-')
    const slugParts = slug.split('-')
    for (let i = 0; i + slugParts.length <= parts.length; i++) {
      if (slugParts.every((sp, j) => parts[i + j] === sp)) return { ...p, matched: slug }
    }
  }
  return null
}

/** The refusal message. It tells the agent exactly how to re-file the work. */
export function coverageRefusal(keyword, hit) {
  const stats = [
    hit.clicks != null ? `${hit.clicks} clicks` : null,
    hit.impressions != null ? `${hit.impressions} impressions` : null,
  ].filter(Boolean).join(', ')
  return (
    `The site ALREADY has a page for "${keyword}" (slug match "${hit.matched}"):\n` +
    `  ${hit.url}${stats ? ` (${stats})` : ''} [${hit.source ?? 'site'}]\n\n` +
    `Do NOT file a new-article task. File the work against the existing page instead: ` +
    `call create_task again with existing_url="${hit.url}" and tactic_type="content_expansion" ` +
    `or "content_refresh". Writing a second page for a keyword you already rank for splits ` +
    `your own signal. Google calls it cannibalisation and it costs you the ranking you have.`
  )
}

/** A soft, advisory token overlap. Never a refusal: it over- and under-matches. */
export function tokenWarning(keyword, pages) {
  const tokens = slugify(keyword).split('-').filter((t) => t.length > 3)
  if (tokens.length === 0) return null
  const near = pages
    .filter((p) => {
      const seg = lastSegment(p.url)
      return tokens.filter((t) => seg.includes(t)).length >= Math.max(2, tokens.length - 1)
    })
    .slice(0, 3)
  if (near.length === 0) return null
  return {
    coverage_warning:
      'Advisory only, not a refusal. These existing pages share most of the keyword tokens. ' +
      'Read them before you write: if one of them is really the same topic, file a refresh instead.',
    pages: near.map((p) => p.url),
  }
}

/**
 * Every page we know you have. Four sources, because any one of them lies.
 *
 * Search Console knows the pages that earn something. The sitemap knows what you
 * published. Neither knows what you published five minutes ago, so the sitemap is
 * fetched LIVE: a cached copy goes stale, and a stale coverage check is worse than
 * none, because it green-lights the duplicate with total confidence.
 */
export async function sitePages() {
  const pages = []

  try {
    const { gscPages } = await import('./gsc.mjs')
    pages.push(...(await gscPages(90)))
  } catch {
    // No Search Console yet (new site). The sitemap still guards us.
  }

  const site = (process.env.SITE_URL || '')
    .replace(/^sc-domain:/, 'https://')
    .replace(/\/+$/, '')
  if (site) {
    try {
      const res = await fetch(`${site}/sitemap.xml`, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const xml = await res.text()
        for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
          pages.push({ url: m[1], source: 'sitemap' })
        }
      }
    } catch {
      // Unreachable. Not fatal, but the gate is weaker for it.
    }
  }

  const seen = new Map()
  for (const p of pages) {
    const key = p.url.replace(/\/+$/, '')
    const prev = seen.get(key)
    seen.set(key, prev ? { ...prev, ...p, source: `${prev.source}+${p.source}` } : p)
  }
  return [...seen.values()]
}
