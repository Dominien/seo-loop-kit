# seo-loop-kit

**You have a website. You want it to rank. You already pay for Claude Code.**

This installs into your website's repo and gives Claude Code three things it does not have on its
own: your Search Console data, a memory that survives the context window, and gates it cannot argue
its way past.

Then it runs your SEO. It finds what is worth fixing, writes it into your real source files, grades
its own work against a rubric it cannot game, and opens a pull request. On a schedule, in the
background, while you do something else.

The only thing left for you is reading the PR and clicking merge.

## The short version, for your vibe-coded site

If Claude Code already lives in your repo, the whole setup is three moves:

**1. Drop it in.** From the root of your repo:

```bash
curl -sL https://raw.githubusercontent.com/marcopatzelt/seo-loop-kit/main/install.sh | bash
```

**2. Add this to your main md file** (`CLAUDE.md` — the installer appends it for you, paste it
yourself if you skipped the script):

```
SEO runs through seo-loop-kit. Read seo/SEO-LOOP.md before doing anything SEO-related.
```

**3. Tell Claude:**

> *based on the seo-loop-kit setup, set up a Claude routine that runs every 21 days, then report
> the results to me on Slack* — or email, or wherever you want the report.

Done. Claude wires the schedule from `seo/routine.md`, the loop runs in the background, and you get
a message when there is a PR worth reading.

The only part it cannot do without you: the one-time keys and the Google login. That is the
[Install](#install) section below, and it takes five minutes.

## Install

From the root of your website's repository:

```bash
curl -sL https://raw.githubusercontent.com/marcopatzelt/seo-loop-kit/main/install.sh | bash
```

It drops in `seo/` and `.claude/`, and it **appends** to your `.gitignore` and `CLAUDE.md` rather
than replacing them. Your `package.json` is not touched. Nothing of yours is overwritten.

```bash
cp .env.example .env      # your Google + DataForSEO keys
node seo/connect.mjs      # one-time Google login
node seo/check.mjs        # tells you what is still missing
```

No `npm install`. **Zero dependencies.** About 1,200 lines of plain Node, readable in ten minutes.

Then open Claude Code in the repo and say:

> *read seo/SEO-LOOP.md, then find me something worth fixing*

## It has to live in your repo

That is the whole design. The agent edits your actual source files and opens a pull request against
your actual branch. A separate checkout somewhere else would just be an elaborate way of writing
articles into a folder nobody deploys.

So the pull request carries the change and the reasoning together:

```
src/blog/satz-des-pythagoras.md   | 42 ++++++++++++
board.md                          |  1 +
board.db                          | Bin
```

And `board.md` tells the reviewer why it exists before they read a line of it:

| | Task | Tactic | Expect | Verify | State |
|---|---|---|---|---|---|
| `746d165a` | Artikel: Satz des Pythagoras | content_expansion | Pos 14 to top 5 | position "satz des pythagoras" | done / pending, 2026-08-04 |

In 21 days, `node seo/cli.mjs due` brings that row back and asks whether it worked.

## Why this exists

Ask Claude to write you an SEO article and it will write you an SEO article. It has no idea what
people search for, what you already rank for, which pages you already have, or whether the topic is
worth a page at all. It is a very fast, very confident guessing machine.

The model is not the problem. What it is missing is not intelligence. It is three specific things:

**Data.** Your Search Console knows what people typed to find you and where you actually rank.
DataForSEO knows whether a topic has demand and who is already winning it. Neither of these is in the
model's weights, and no amount of prompting will put them there.

**Memory.** A context window ends. `board.db` does not. It is a SQLite file in your repo: what was
done, what it was supposed to move, and whether it moved.

**Gates.** Not prompt reminders. Refusals.

That last one is the part everyone skips, so it gets its own section.

## Why gates, and not a longer prompt

A find pass once filed ten "write a new article" tasks. Every single one already existed as a live
page on the site. One of them had 564 clicks.

The agent had done exactly what it was told. It deduped against the **board**. Nobody had told it to
dedupe against the **site**.

You can fix that with a longer prompt. It works for a while, then the context fills up, and it
quietly stops working, and you find out three months later when your rankings have split across two
pages fighting each other.

So here it is not a prompt. `seo create` runs a deterministic slug check against your live sitemap
and your Search Console pages, and if the page exists, **the command fails**:

```
The site ALREADY has a page for "satz des pythagoras" (slug match "satz-des-pythagoras"):
  https://example.com/blog/satz-des-pythagoras (564 clicks) [gsc+sitemap]

Do NOT file a new-article task. File the work against the existing page instead.
```

There is no line that says "be careful". There is a wall.

Same principle, three more times:

- **You cannot file a finding you cannot measure.** Every task carries a metric and a target, or a
  written reason why it cannot. That is a `CHECK` constraint in the schema, not a convention. A rule
  in the database is still there on turn 40. A rule in a prompt is not.
- **You cannot propose new content without looking first.** `seo create` demands a signed ref from
  `seo inventory`, and it expires in an hour. It does not check *what* you saw. It enforces that you
  looked.
- **You cannot close an article without a passing critic.** A separate subagent, fresh context, reads
  the article and nothing else. Below 24 of 30, or any hard stop, and `seo update --status=done`
  throws. A model grading its own output does not grade the output. It grades its own intentions, and
  its intentions were excellent, which is exactly why it wrote it that way.

## The commands

Claude Code drives these with Bash.

```
node seo/cli.mjs project        where you stand
node seo/cli.mjs striking       position 8-20. Start here. Always.
node seo/cli.mjs ctr-gap        ranks fine, nobody clicks: a title problem, not a content one
node seo/cli.mjs volume <kw>    real search volume
node seo/cli.mjs serp <kw>      who is on page 1, and is an AI overview eating the clicks
node seo/cli.mjs inventory      every page you have (required before new content)
node seo/cli.mjs create --title=...
node seo/cli.mjs update <h> --status=done
node seo/cli.mjs eval <h> --kind=critic --verdict=pass --artifact-sha=<sha>
node seo/cli.mjs due            what is ready to be judged
node seo/cli.mjs what-works     which tactics actually moved the needle
node seo/cli.mjs export         board.md, so the board diffs in the pull request
```

**Start with what you already half-own.** `striking` returns queries at position 8 to 20. You are
already on page one or two. Moving one into the top five is the cheapest win available, every time.
Writing a new article is the most expensive move on the board, and it is the one every agent reaches
for first, because it feels like work.

## The loop

```
review    seo due          did the last round actually work?
find      seo striking     own data first, then new topics
present   a numbered list. Then it stops and waits for you.
build     real files in your repo. The build has to pass.
grade     fresh-context critic. 24/30 or it does not ship.
ship      branch, commit, pull request. Never main.
```

## Running it on a schedule

`seo/routine.md` is a Claude Code routine prompt. Copy the body, point it at your repo, and schedule
it every 21 days.

```
/schedule every 21 days: run the loop in seo/routine.md
/goal do not stop until every task due for verification has a recorded verdict, and every task the
human selected is either shipped as a PR or left open with a reason. Stop after 8 turns.
```

Why 21: closing a measurable task queues its check for +21 days. A faster cadence just lands before
the last round has finished proving itself. The clock comes from the loop, not from a preference.

Why the explicit goal: without a stop condition the model decides for itself when it has done enough,
and it decides too early. "Every due task has a verdict" is checkable. "Do a good job on the SEO" is
not, and it will declare victory on that in about four minutes.

Permissions: allow edit, commit, push to a branch, `gh pr create`. **Deny merge.** That single
refusal is your entire role in the system. Everything else runs without you.

## What is in here

```
seo/cli.mjs           the command surface
seo/board.mjs         SQLite. The memory, and most of the gates.
seo/coverage.mjs      the slug check that refuses duplicate pages
seo/gsc.mjs           your Search Console
seo/keywords.mjs      real search volume, difficulty, live SERPs
seo/SEO-LOOP.md       the doctrine. Claude reads this first.
seo/routine.md        the scheduled loop
seo/fixtures/         one good article, one deliberately terrible one
.claude/skills/       how to write it, the groundwork under it, the bar it has to clear
.claude/agents/       the critic that grades with fresh context
```

Those two fixtures are not decoration. Before the critic may grade anything, it scores both. The good
one must clear 24. The bad one must fall below 16. If it cannot tell them apart, **it grades nothing
that day**.

Ten seconds, every run. Because a broken judge does not fail loudly: it passes everything, and you
never find out, because the thing you built to catch the problem is the thing that broke.

## What you need

- **Google Search Console**, verified for your site. Free. `node seo/connect.mjs` handles the OAuth
  once, and the token never leaves your machine.
- **[DataForSEO](https://dataforseo.com)**, pay-as-you-go, cents per call. This is what turns "sounds
  like a good topic" into "1,900 searches a month, difficulty 24, and the top three results are all
  thin".
- **Claude Code**, on a subscription. This kit adds no API costs of its own.
- **Node 22 or newer** (it uses the built-in SQLite).

Set `DATAFORSEO_LOCATION_CODE` to your market. Get it wrong and German keywords come back with volume
zero while your research lands on US search results. Nothing crashes. Everything appears to work. The
results are garbage. (This happened. Eleven projects out of twelve, for weeks.)

## It will refuse you, and that is the feature

Most agent tooling is built to make the agent do more. This is mostly built to stop it.

The value is not that it can write an article. Everything can write an article, and that is exactly
the problem: if everyone lets the model pick the topics, everyone converges on the same article. The
value is that it knows which article is worth writing for *your* site, refuses to write one you
already have, and can tell you in three weeks whether it was right.

MIT. Take it apart.
