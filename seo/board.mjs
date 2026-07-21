// The task board. SQLite, in a file, in your repo.
//
// This is the agent's memory. A context window ends; this does not. It is what
// was done, why, what it was supposed to move, and whether it moved.
//
// The schema is the point. Every constraint below is a thing the agent cannot
// do, enforced by the database rather than by a paragraph in a prompt that it
// will still be obeying on turn 3 and quietly ignoring on turn 40.

import { DatabaseSync } from 'node:sqlite'
import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export const VERIFY_AFTER_DAYS = 21

// A closed list, enforced by the DB. Free text here would fragment into a
// hundred one-row categories, and the question "which tactic actually works"
// would become unanswerable, which is the only question worth asking.
export const TACTICS = [
  'new_page', 'content_expansion', 'content_refresh', 'title_meta_rewrite',
  'internal_linking', 'schema_markup', 'technical_fix', 'thin_page_fix',
  'keyword_targeting', 'page_speed', 'other',
]
export const METRICS = ['clicks', 'impressions', 'ctr', 'position']
export const CATEGORIES = ['content', 'technical', 'linking', 'performance']

let db

export function open(file = process.env.BOARD_PATH || 'board.db') {
  if (db) return db
  const p = path.resolve(file)
  mkdirSync(path.dirname(p), { recursive: true })
  db = new DatabaseSync(p)
  db.exec(`
    pragma journal_mode = wal;

    create table if not exists tasks (
      id                  text primary key,
      title               text not null,
      description         text not null default '',
      category            text not null default 'content'
                          check (category in ('content','technical','linking','performance')),
      priority            text not null default 'medium'
                          check (priority in ('high','medium','low')),
      status              text not null default 'open'
                          check (status in ('open','in_progress','done','archived')),

      -- The human triage axis. The agent reads it. Only a person writes it.
      -- Every task is born 'suggested'. A person promotes it to 'ready_for_draft'
      -- before any drafting is allowed. The agent never promotes its own finding.
      review_state        text not null default 'suggested'
                          check (review_state in ('suggested','ready_for_draft','dismissed')),

      primary_keyword     text not null default '',
      existing_url        text not null default '',
      tactic_type         text check (tactic_type in (
                            'new_page','content_expansion','content_refresh','title_meta_rewrite',
                            'internal_linking','schema_markup','technical_fix','thin_page_fix',
                            'keyword_targeting','page_speed','other')),

      -- The contract. Say what should move, and how you will know.
      expected_impact     text not null default '',
      verify_metric       text check (verify_metric in ('clicks','impressions','ctr','position')),
      verify_target       text not null default '',
      unmeasurable_reason text,
      evidence            text not null default '',

      verification_status text not null default 'none'
                          check (verification_status in ('none','pending','confirmed','inconclusive','regressed')),
      verify_after        text,
      verification_note   text not null default '',

      files_changed       text not null default '[]',
      pr_url              text not null default '',
      implementation_note text not null default '',
      after_ref           text,

      created_at          text not null,
      updated_at          text not null,

      -- A measurable task with no metric is not a task, it is a wish. A task
      -- that opts out must say so on the record, so an accident cannot be
      -- mistaken for a decision.
      check (
        (verify_metric is not null and verify_target <> '')
        or unmeasurable_reason is not null
      )
    );

    -- The ledger. What worked, in what context, and how sure are we.
    create table if not exists evals (
      id              integer primary key autoincrement,
      task_id         text not null references tasks(id) on delete cascade,
      kind            text not null check (kind in ('critic','seo_fix','article')),
      verdict         text not null check (verdict in ('pass','fail','confirmed','regressed','inconclusive')),
      tactic_type     text,
      score           real,
      artifact_sha    text,
      context         text not null default '{}',
      notes           text not null default '',
      -- Defaults to self_report on purpose. A number a model produced about its
      -- own work is not the same kind of number as one measured in Search Console,
      -- and the ledger should never pretend otherwise.
      measured_method text not null default 'self_report'
                      check (measured_method in ('deterministic','self_report','manual')),
      created_at      text not null
    );

    create index if not exists idx_tasks_status on tasks(status);
    create index if not exists idx_tasks_verify on tasks(verify_after) where verification_status = 'pending';
    create index if not exists idx_evals_task on evals(task_id);
  `)
  return db
}

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)
const short = (id) => id.slice(0, 8)

function hydrate(row) {
  if (!row) return null
  return {
    ...row,
    handle: short(row.id),
    files_changed: JSON.parse(row.files_changed || '[]'),
  }
}

function resolve(idOrHandle) {
  const d = open()
  const row =
    d.prepare('select * from tasks where id = ?').get(idOrHandle) ??
    d.prepare('select * from tasks where id like ?').get(idOrHandle + '%')
  if (!row) throw new Error(`No task matches "${idOrHandle}".`)
  return row
}

export function listTasks({ status, category, review_state } = {}) {
  const d = open()
  const where = []
  const args = []
  if (status) { where.push('status = ?'); args.push(status) } else { where.push("status <> 'archived'") }
  if (category) { where.push('category = ?'); args.push(category) }
  if (review_state) { where.push('review_state = ?'); args.push(review_state) }
  const rows = d
    .prepare(`select * from tasks where ${where.join(' and ')} order by created_at`)
    .all(...args)
  return rows.map(hydrate)
}

export function getTask(idOrHandle) {
  const d = open()
  const t = resolve(idOrHandle)
  const evals = d.prepare('select * from evals where task_id = ? order by created_at desc').all(t.id)
  const passing = evals.find(
    (e) => e.kind === 'critic' && e.verdict === 'pass' && (!t.after_ref || e.artifact_sha === t.after_ref),
  )
  return { ...hydrate(t), evals, critic_gated: t.category === 'content', passing_critic_verdict: passing ?? null }
}

export function createTask(input) {
  const d = open()

  // Do not file the same finding twice. An agent that re-reads the site every
  // three weeks will re-notice the same gap every three weeks.
  const norm = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const dup = d
    .prepare("select * from tasks where status = 'open'")
    .all()
    .find(
      (t) =>
        norm(t.title) === norm(input.title) ||
        (input.verify_target && norm(t.verify_target) === norm(input.verify_target)),
    )
  if (dup) return { ...hydrate(dup), deduped: true, note: 'An open task already covers this. Returning it instead of creating a duplicate.' }

  const measurable = input.measurable !== false
  if (measurable && (!input.verify_metric || !input.verify_target)) {
    throw new Error(
      'A measurable task needs verify_metric (clicks|impressions|ctr|position) AND verify_target, ' +
        'so that in 21 days something can actually check it. If it genuinely cannot be measured, ' +
        'pass --measurable=false WITH --unmeasurable-reason.',
    )
  }
  if (!measurable && !input.unmeasurable_reason) {
    throw new Error('--measurable=false needs --unmeasurable-reason, so an off-eval task is a decision and not an accident.')
  }

  const id = randomUUID()
  const t = now()
  d.prepare(`
    insert into tasks (
      id, title, description, category, priority, review_state,
      primary_keyword, existing_url, tactic_type, expected_impact,
      verify_metric, verify_target, unmeasurable_reason, evidence,
      created_at, updated_at
    ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    input.title,
    input.description ?? '',
    input.category ?? 'content',
    input.priority ?? 'medium',
    'suggested',
    input.primary_keyword ?? '',
    input.existing_url ?? '',
    input.tactic_type ?? null,
    input.expected_impact ?? '',
    input.verify_metric ?? null,
    input.verify_target ?? '',
    input.unmeasurable_reason ?? null,
    input.evidence ?? '',
    t,
    t,
  )
  return hydrate(resolve(id))
}

export function updateTask(idOrHandle, patch) {
  const d = open()
  const t = resolve(idOrHandle)

  if (patch.status === 'done' && t.category === 'content') {
    // THE GATE.
    //
    // A content task cannot be closed without a passing critic verdict for THIS
    // artifact. Not a reminder. A refusal. A model that grades its own work does
    // not grade the work, it grades its own intentions, and its intentions were
    // excellent, which is precisely why it wrote it that way.
    const sha = patch.after_ref ?? t.after_ref
    const pass = d
      .prepare("select * from evals where task_id = ? and kind = 'critic' and verdict = 'pass'")
      .all(t.id)
      .find((e) => !sha || e.artifact_sha === sha)
    if (!pass) {
      throw new Error(
        'Refused: no passing critic verdict on the ledger for this task.\n' +
          '  Run the critic subagent on the file, then:\n' +
          '  seo eval <task> --kind=critic --verdict=pass --artifact-sha=<sha256 of the file>\n' +
          '  A verdict pinned to a different file is not a verdict for this one.',
      )
    }
  }

  const set = {}
  for (const k of [
    'status', 'title', 'description', 'priority', 'review_state',
    'expected_impact', 'verify_metric', 'verify_target', 'tactic_type',
    'pr_url', 'implementation_note', 'after_ref', 'evidence',
    'verification_status', 'verification_note',
  ]) if (patch[k] !== undefined) set[k] = patch[k]

  if (patch.files_changed) set.files_changed = JSON.stringify(patch.files_changed)

  // Closing a measurable task starts its clock.
  if (patch.status === 'done' && t.verify_metric && t.verification_status === 'none') {
    set.verification_status = 'pending'
    set.verify_after = new Date(Date.now() + VERIFY_AFTER_DAYS * 864e5).toISOString().slice(0, 10)
  }
  // Reopening it stops the clock. A task under revision is not a task under test.
  if ((patch.status === 'open' || patch.status === 'in_progress') && t.verification_status === 'pending') {
    set.verification_status = 'none'
    set.verify_after = null
  }

  set.updated_at = now()
  const cols = Object.keys(set)
  d.prepare(`update tasks set ${cols.map((c) => `${c} = ?`).join(', ')} where id = ?`)
    .run(...cols.map((c) => set[c]), t.id)

  const out = hydrate(resolve(t.id))
  if (out.verification_status === 'pending') {
    out.verification = {
      status: 'pending',
      verify_after: out.verify_after,
      note: `Queued. On or after ${out.verify_after}, re-measure ${out.verify_metric} for "${out.verify_target}".`,
    }
    out.next = 'Now record what you actually did: seo eval <task> --kind=seo_fix --tactic-type=... so the ledger knows the tactic, not just the outcome.'
  }
  return out
}

export function recordEval(taskIdOrHandle, e) {
  const d = open()
  const t = resolve(taskIdOrHandle)
  d.prepare(`
    insert into evals (task_id, kind, verdict, tactic_type, score, artifact_sha, context, notes, measured_method, created_at)
    values (?,?,?,?,?,?,?,?,?,?)
  `).run(
    t.id,
    e.kind,
    e.verdict,
    e.tactic_type ?? t.tactic_type ?? null,
    e.score ?? null,
    e.artifact_sha ?? null,
    JSON.stringify(e.context ?? {}),
    e.notes ?? '',
    e.measured_method ?? 'self_report',
    now(),
  )
  const count = d.prepare('select count(*) as n from evals where task_id = ?').get(t.id).n
  // A draft you threw away still gets recorded. A lost bet is data: it tells you
  // which tactic does not work in which context, and that is worth more than
  // another article that does.
  return { ok: true, task: short(t.id), evals_on_task: count }
}

export function dueForVerification() {
  const d = open()
  return d
    .prepare("select * from tasks where verification_status = 'pending' and verify_after <= ?")
    .all(today())
    .map(hydrate)
}

export function stats() {
  const d = open()
  const g = (sql, ...a) => d.prepare(sql).get(...a).n
  return {
    open: g("select count(*) as n from tasks where status = 'open'"),
    in_progress: g("select count(*) as n from tasks where status = 'in_progress'"),
    done: g("select count(*) as n from tasks where status = 'done'"),
    awaiting_verification: g("select count(*) as n from tasks where verification_status = 'pending'"),
    due_now: dueForVerification().length,
  }
}

/**
 * What actually works, by tactic. The whole reason for the closed taxonomy.
 *
 * After a few rounds this stops being a nice-to-have and starts being the only
 * thing in the repo that can tell you to stop writing new articles and go fix
 * your titles instead.
 */
export function whatWorks() {
  const d = open()
  return d.prepare(`
    select tactic_type,
           count(*) as attempts,
           sum(case when verdict = 'confirmed'    then 1 else 0 end) as confirmed,
           sum(case when verdict = 'regressed'    then 1 else 0 end) as regressed,
           sum(case when verdict = 'inconclusive' then 1 else 0 end) as inconclusive
    from evals
    where kind = 'seo_fix' and tactic_type is not null
    group by tactic_type
    order by confirmed desc, attempts desc
  `).all()
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex')
