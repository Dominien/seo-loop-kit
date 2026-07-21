---
name: drafting-article
description: Turning one human-approved task into a publish-ready article committed as a real file in the site's own repository. Walks through the go-ahead check, learning the repo's own conventions, studying the page you have to beat, avoiding duplication of coverage the site already has, links that actually resolve, prose that does not read like a machine, and the critic grade required before a task can close.
---

# Writing the article

The output of this skill is one file, committed into the site's real repository, in the exact shape
of the pages already there. Not a chat answer, not a payload for some CMS, not a draft in a scratch
folder. A file that builds with the site and ships in a pull request next to its neighbours.

Work through the three phases below in order. Nothing in them is optional, and the last phase is a
gate you cannot sign off on yourself.

---

## Phase one — earn the right to start

### The go-ahead is a human pick, nothing else

You may draft against a task **only** once a person has moved its `review_state` to
`ready_for_draft`. That state is set by a human choosing the task out of the numbered list the loop
presented; the loop never sets it on its own finding. If the task is still `suggested`, it has not
been chosen yet, and drafting it is exactly the confident, unasked-for move this whole system exists
to prevent. Stop and leave it for the next human pass.

Once it is `ready_for_draft`, pull the task and read it:

```
node seo/cli.mjs task <handle>
```

The evidence on it — the query, the search volume, the competitor position — is your brief. Keep it
open the whole time you write. Everything downstream is judged against that brief, not against a
nicer topic you thought of on the way.

### Learn the house style before you touch the keyboard

You are a guest in someone else's codebase. A file that does not match the ones around it either
breaks the build or looks like it was bolted on, and both are your fault, not the repo's.

- Find where articles live. It might be `content/blog/*.md`, an Astro collection under
  `src/content/`, `posts/*.mdx`, an `app/blog/[slug]/page.tsx` route, or plain HTML templates.
- Open two or three existing articles and read them all the way down. Copy what you see: the exact
  frontmatter keys and their order, the date format, how the slug is built, how images are
  referenced, which heading level the body starts at (many templates render the title as the `<h1>`
  themselves, so your body must open at `<h2>`), and whether the content uses components.
- If there is a schema — a content collection config, a frontmatter validator — your file has to
  satisfy it or the build fails.

If you genuinely cannot find the pattern, ask. Do not invent a new content format because you prefer
it.

---

## Phase two — write something that deserves to outrank what is there

### Take apart the page you have to beat

Whatever currently ranks for your query is already winning. Understand it before you try to unseat
it.

```
node seo/cli.mjs serp "<verify_target from the task>"
```

Then actually fetch and study the top result. Write down its sections, how deep it goes, the
entities it names, the questions it answers, and — more useful — the questions it dodges and the
places it stays vague. Whatever terms it already earns rankings on should surface naturally across
your headings, title, body, and any FAQ, wherever they fit without being forced. Study its coverage; never reuse its wording. If the
tools return nothing for the term, say so in your notes and work from the Search Console queries
alone. Do not fill the gap with invented competitor data.

### Do not write a page the site already has

```
node seo/cli.mjs inventory
```

Two pages fighting over one query lose to one page that owns it, so before you add coverage, check
what is already there. The `seo create` gate already refuses brand-new tasks on a query the site
covers, so if you are drafting, the main topic is clear. But adjacent pages will exist, and they
matter twice: you must not restate what they already say, and you will link to them in a moment.
Read them. Go deeper on the part they skip and point to them for the rest.

### Outline as a superset, then write

Your outline is not "everything about the topic". It is: everything the ranking page covers, plus
the questions it avoids, minus anything your own site already says better elsewhere. Write that
outline down before you write prose. If it is not a superset of the page you are trying to beat, the
article will not beat it.

Then write, in the site's own voice — the same address (formal or familiar), the same distance, the
same rhythm you read in its existing articles. As you write, hold these:

- **Lead with the answer.** Resolve whatever the page is fundamentally about right at the top: a
  reader, or an AI answer engine scanning for something to quote, should be able to take your first
  two sentences on their own and walk away satisfied, before a word of setup arrives. Bury the payoff
  three paragraphs down and both the impatient visitor and the engine will already be gone.
- **Be specific on purpose.** Numbers, named steps, real examples, a stated tradeoff. A concrete
  detail every few paragraphs is what makes a page worth citing and worth reading. Vague and correct
  is neither.
- **Source every fact, or mark it illustrative.** Answer engines reward specificity, which is
  exactly what tempts a model to invent a statistic to look quotable. Do not. Every number, quote,
  or named fact needs a real source; an example figure gets labelled as an example. A fabricated
  fact is an automatic fail at the critic, at any score.
- **No machine tells, written in, not cleaned up afterward.** No emoji anywhere. No em dash or en
  dash standing in for a comma, colon, or parentheses (a normal hyphen inside a compound word is
  fine). None of "in today's fast-paced world", "it is important to note that", "let's dive in", "in
  conclusion". No paragraph so generic it could be pasted onto any other site unchanged. A cleanup
  pass catches the banned phrases; it does not catch the paragraph that was about nothing.

### Every internal link has to resolve

Broken internal links are where drafts quietly ship 404s, and a dead link scores zero at the critic
as a hard stop.

- Assemble the set of URLs you are allowed to point at from `seo inventory` together with the site's
  real routes and sitemap.
- Pull every link target straight from that verified set. If a slug, an author path, or a category
  page is not on it, you have no grounds to link there, so do not.
- Prove each target loads — a file that exists on disk for a static route, or a 200 from the site
  origin. Appearing in a sitemap settles nothing; a path can be listed there and still 404.
- When a target cannot be confirmed, leave the words unlinked. A plain honest phrase beats a
  confident link into a 404.

The structural and schema layer — one `<h1>`, a clean heading hierarchy, canonical, meta, valid
JSON-LD, front-loaded extractable answers — comes from `seo-foundation`. Apply it as you write.
It is table stakes, not the payoff. Get it right and move on, because nobody ever stayed on a page
for its canonical tag.

---

## Phase three — hand it to the critic, then close the task

You do not certify your own work. A model grading what it just wrote grades its own intentions,
which were good, which is why it wrote it that way.

1. Spawn the `article-critic` subagent with fresh context and have it grade the file against
   `master-rubric`: six lenses scored out of 30, a page ships at **24 or higher** with no hard stop
   and the demand-fit, trust, and register floors clear. The critic zeroes itself on the two
   fixtures first. If your page misses, revise once and send it back. Three misses and it goes to a
   human.
2. Log the passing verdict, then close the task:

```
node seo/cli.mjs eval <handle> --kind=critic --verdict=pass --artifact-sha=<sha256 of the file>
node seo/cli.mjs update <handle> --status=done --pr-url=<url> --files-changed=<paths>
```

`seo update --status=done` refuses to close a content task that has no passing critic row for the
exact file, and that refusal is the point. The board lives in `board.db` and `seo export` writes
`board.md`, so the article, its verdict, and its task all land in one commit and the whole decision
is auditable months later.

---

## The short version

```
review_state is ready_for_draft (human-selected)?     else STOP
read 2-3 existing articles; copy the frontmatter, slug, heading depth, image refs exactly
seo serp <target>  -> study the ranking page: its sections, its gaps, its keywords
seo inventory      -> do not restate your own pages; link them instead
outline = the ranking page's coverage + its gaps - what you already cover
write: site voice, answer first, concrete specifics, a source for every fact
       no emoji, no dash-as-punctuation, nothing that reads like autopilot
internal links: only confirmed URLs, each one resolves, unresolved stays unlinked
apply seo-foundation as you go (one h1, hierarchy, canonical, meta, schema, lead answer)
article-critic grades vs master-rubric: 24/30, no hard stop -> seo eval -> seo update
```
