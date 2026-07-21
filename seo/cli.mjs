#!/usr/bin/env node
// The whole interface. Claude Code already has Bash; it does not need a protocol
// to talk to a file on its own disk.
//
//   seo project                      where do you stand
//   seo striking                     queries at position 8-20: your cheapest wins
//   seo ctr-gap                      ranks fine, nobody clicks: a title problem
//   seo queries | pages              raw Search Console
//   seo volume <kw...>               real search volume
//   seo serp <kw>                    who is on page 1, and is there an AI overview
//   seo difficulty <kw...>           how hard is this to win
//   seo inventory                    every page you have (required before new content)
//   seo tasks [--status=open]        the board
//   seo task <handle>                one task, with its eval history
//   seo create --title=... ...       file a finding (the gates live here)
//   seo update <handle> --status=done ...
//   seo eval <handle> --kind=critic --verdict=pass --artifact-sha=...
//   seo due                          what is ready to be judged
//   seo what-works                   which tactics actually moved the needle
//   seo export                       write board.md for the pull request diff
//
// Every gate below exits non-zero with a message that says what to do instead.
// An agent reads that. A prompt reminder, it eventually stops reading.

import { loadEnv } from './env.mjs'
loadEnv()

import * as board from './board.mjs'
import { gscRankings, gscSummary, gscPages } from './gsc.mjs'
import { keywordVolume, competitorKeywords, keywordDifficulty } from './keywords.mjs'
import { sitePages, findSlugCoverage, coverageRefusal, tokenWarning, mintRef, verifyRef } from './coverage.mjs'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const cmd = argv[0]
const rest = argv.slice(1).filter((a) => !a.startsWith('--'))
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=')
      return [k.replace(/-/g, '_'), v.length ? v.join('=') : true]
    }),
)

const out = (d) => console.log(typeof d === 'string' ? d : JSON.stringify(d, null, 1))
const die = (msg) => { console.error(msg); process.exit(1) }

try {
  switch (cmd) {
    case 'project': {
      let gsc
      try { gsc = await gscSummary(90) } catch (e) { gsc = { error: e.message } }
      out({
        site: process.env.SITE_URL ?? null,
        repo: process.cwd(),
        search_console: gsc,
        board: board.stats(),
        keyword_data: process.env.DATAFORSEO_LOGIN ? 'configured' : 'MISSING: set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env',
        start_here: 'seo striking',
      })
      break
    }

    case 'striking':
      out(await gscRankings({ type: 'striking_distance', limit: Number(flags.limit ?? 25) }))
      break

    case 'ctr-gap':
      out(await gscRankings({ type: 'ctr_gap', limit: Number(flags.limit ?? 25) }))
      break

    case 'queries':
      out(await gscRankings({ type: 'queries', limit: Number(flags.limit ?? 50) }))
      break

    case 'pages':
      out(await gscRankings({ type: 'pages', limit: Number(flags.limit ?? 50) }))
      break

    case 'summary':
      out(await gscSummary(Number(flags.days ?? 90)))
      break

    case 'volume':
      if (!rest.length) die('usage: seo volume "keyword one" "keyword two"')
      out(await keywordVolume(rest))
      break

    case 'difficulty':
      if (!rest.length) die('usage: seo difficulty "keyword one" "keyword two"')
      out(await keywordDifficulty(rest))
      break

    case 'serp':
      if (!rest[0]) die('usage: seo serp "your keyword"')
      out(await competitorKeywords(rest[0]))
      break

    case 'inventory': {
      const pages = await sitePages()
      out({
        inventory_ref: mintRef(),
        page_count: pages.length,
        pages: pages.map((p) => ({ url: p.url, clicks: p.clicks ?? null, source: p.source })),
        note:
          'Pass --inventory-ref to `seo create` for new content. It expires in about an hour. ' +
          'It does not check WHAT you saw. It enforces that you looked.',
      })
      break
    }

    case 'tasks':
      out(board.listTasks({ status: flags.status, category: flags.category, review_state: flags.review_state }))
      break

    case 'task':
      if (!rest[0]) die('usage: seo task <handle>')
      out(board.getTask(rest[0]))
      break

    case 'create': {
      if (!flags.title) die('usage: seo create --title="..." --category=content --verify-metric=position --verify-target="..."')

      const isNewContent = (flags.category ?? 'content') === 'content' && !flags.existing_url

      if (isNewContent) {
        // Gate 1: you must have looked at the site first.
        //
        // "Check the sitemap before proposing a page" is not enforceable as an
        // instruction. Agents forget. So it is enforced here instead.
        if (!verifyRef(flags.inventory_ref)) {
          die(
            'Refused: new-content tasks need a fresh --inventory-ref.\n' +
              '  Run `seo inventory` first and pass the ref it returns.\n' +
              '  This is not paperwork. The next gate depends on you having actually looked.',
          )
        }

        // Gate 2: do not write a page you already have.
        //
        // A find pass once filed ten "write a new article" tasks. Every one of
        // them already existed as a live page. One had 564 clicks. The agent had
        // deduped against the board, which is exactly what it was told to do.
        // Nobody had told it to dedupe against the site.
        const kw = flags.primary_keyword || flags.verify_target || flags.title
        const pages = await sitePages()
        const hit = findSlugCoverage(kw, pages)
        if (hit) die(coverageRefusal(kw, hit))

        const task = board.createTask({
          ...flags,
          measurable: flags.measurable !== 'false',
        })
        const warn = tokenWarning(kw, pages)
        out(warn ? { ...task, ...warn } : task)
        break
      }

      out(board.createTask({ ...flags, measurable: flags.measurable !== 'false' }))
      break
    }

    case 'update': {
      if (!rest[0]) die('usage: seo update <handle> --status=done --pr-url=... --after-ref=<sha>')
      const patch = { ...flags }
      if (flags.files_changed) patch.files_changed = String(flags.files_changed).split(',').map((s) => s.trim())
      out(board.updateTask(rest[0], patch))
      break
    }

    case 'eval': {
      if (!rest[0] || !flags.kind || !flags.verdict) {
        die('usage: seo eval <handle> --kind=critic|seo_fix|article --verdict=pass|fail|confirmed|regressed|inconclusive [--score=18] [--artifact-sha=...] [--tactic-type=...] [--measured-method=deterministic]')
      }
      out(board.recordEval(rest[0], {
        kind: flags.kind,
        verdict: flags.verdict,
        score: flags.score ? Number(flags.score) : null,
        artifact_sha: flags.artifact_sha ?? null,
        tactic_type: flags.tactic_type ?? null,
        measured_method: flags.measured_method ?? 'self_report',
        notes: flags.notes ?? '',
        context: flags.context ? JSON.parse(flags.context) : {},
      }))
      break
    }

    case 'due': {
      const due = board.dueForVerification()
      out({
        count: due.length,
        tasks: due.map((t) => ({
          handle: t.handle,
          title: t.title,
          verify_metric: t.verify_metric,
          verify_target: t.verify_target,
          verify_after: t.verify_after,
          shipped: t.implementation_note || t.pr_url || null,
        })),
        how_to_judge:
          'Re-measure with `seo queries` and compare against `seo summary` for the whole site. ' +
          'If everything rose, this fix did not do it: record inconclusive, not confirmed. ' +
          'Never upgrade a verdict because you would like it to be true.',
      })
      break
    }

    case 'what-works': {
      const rows = board.whatWorks()
      if (!rows.length) {
        out('Nothing measured yet. Come back after a round of fixes has finished its 21 days.')
        break
      }
      out(rows)
      break
    }

    case 'export': {
      // SQLite does not diff in a pull request. This does. The database stays the
      // source of truth; this is the human-readable shadow that travels with the
      // code change and explains why it exists.
      const tasks = board.listTasks({})
      const lines = [
        '# Board',
        '',
        '_Generated by `seo export`. The source of truth is `board.db`._',
        '',
        '| | Task | Tactic | Expect | Verify | State |',
        '|---|---|---|---|---|---|',
      ]
      for (const t of tasks) {
        const v = t.verification_status === 'pending' ? `pending, ${t.verify_after}` : t.verification_status
        lines.push(
          `| \`${t.handle}\` | ${t.title.replace(/\|/g, '\\|')} | ${t.tactic_type ?? ''} | ` +
          `${(t.expected_impact || '').slice(0, 60).replace(/\|/g, '\\|')} | ` +
          `${t.verify_metric ?? ''} ${t.verify_target ? `"${t.verify_target.slice(0, 30)}"` : ''} | ${t.status} / ${v} |`,
        )
      }
      const works = board.whatWorks()
      if (works.length) {
        lines.push('', '## What has actually worked', '', '| Tactic | Tried | Confirmed | Regressed | Inconclusive |', '|---|---|---|---|---|')
        for (const w of works) lines.push(`| ${w.tactic_type} | ${w.attempts} | ${w.confirmed} | ${w.regressed} | ${w.inconclusive} |`)
      }
      writeFileSync('board.md', lines.join('\n') + '\n')
      out(`Wrote board.md (${tasks.length} tasks). Commit it with the change so the PR shows what the board thinks.`)
      break
    }

    default:
      out(`seo, the loop's command surface. Claude Code drives this with Bash.

  seo project              where you stand
  seo striking             position 8-20. Start here. Always.
  seo ctr-gap              ranks well, nobody clicks
  seo queries | pages      raw Search Console
  seo summary              the whole property

  seo volume <kw...>       real search volume
  seo difficulty <kw...>   how hard to win
  seo serp <kw>            who is on page 1

  seo inventory            every page you have (required before new content)
  seo tasks                the board
  seo task <handle>        one task and its evals
  seo create --title=...   file a finding
  seo update <h> --status=done
  seo eval <h> --kind=critic --verdict=pass
  seo due                  what is ready to be judged
  seo what-works           which tactics moved the needle
  seo export               board.md, for the pull request

Read CLAUDE.md. Read .claude/skills/. The gates will refuse you, and they are right to.`)
  }
} catch (e) {
  die(`ERROR: ${e.message}`)
}
