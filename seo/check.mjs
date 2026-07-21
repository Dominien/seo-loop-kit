#!/usr/bin/env node
// Does this thing actually work? Tells you exactly what is missing, and nothing else.

import { loadEnv } from './env.mjs'; loadEnv()
import { gscSummary, gscRankings } from './gsc.mjs'
import { keywordVolume } from './keywords.mjs'

const pass = (s) => console.log(`  ok    ${s}`)
const fail = (s, why) => { console.log(`  FAIL  ${s}\n        ${why}`); failed = true }
let failed = false

console.log('\n  seo-loop-kit\n')

// 1. Site
if (process.env.SITE_URL) pass(`site: ${process.env.SITE_URL}`)
else fail('SITE_URL', 'Not set in .env. Use the exact property name from Search Console.')

// 2. Search Console
try {
  const s = await gscSummary(90)
  if (s.error) throw new Error(s.error)
  pass(`search console: ${s.clicks} clicks, ${s.impressions} impressions, avg position ${s.position ?? '-'} (90d)`)
  if (s.impressions === 0) {
    console.log('        No impressions yet. New site? Then the agent will lean on keyword data instead.')
  }

  const sd = await gscRankings({ type: 'striking_distance', limit: 5 })
  if (sd.length) {
    console.log(`\n  ${sd.length} queries sitting in striking distance (position 8-20). Your cheapest wins:\n`)
    for (const r of sd) {
      console.log(`        pos ${String(r.position).padStart(4)}  ${String(r.impressions).padStart(5)} impr  ${r.query}`)
    }
    console.log('')
  }
} catch (e) {
  fail('search console', e.message)
}

// 3. Keyword data
try {
  const [k] = await keywordVolume(['seo'])
  pass(`keyword data: live (control query "seo" = ${k?.volume ?? '?'} searches/month in your market)`)
} catch (e) {
  fail('keyword data', e.message)
}

console.log(
  failed
    ? '\n  Fix the above, then run this again.\n'
    : '\n  All good. Open Claude Code in this repo and say: "look at the board and find me something worth fixing".\n',
)
process.exit(failed ? 1 : 0)
