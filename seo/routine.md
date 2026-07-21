# The SEO loop, routine prompt

This is a **proactive loop**: it runs on a schedule, with nobody watching, and each pass exits when
its goal is met. You hand off the trigger and the stop condition. The only thing left to you is the
merge button.

## Set it up

**Schedule it every 21 days.** That is not taste. Closing a measurable task queues its check for +21
days, so a faster cadence just lands before the last round has finished proving itself. The clock
comes from the loop.

**Permissions:** allow read, edit, commit, push to a branch, and `gh pr create`. **Deny merge.** That
one refusal is the entire human role in this system.

**Give it a stop condition.** Without one, the model decides for itself when it has done enough, and
it will usually decide too early. The routine below has its own exit criteria written in, but you can
also wrap the whole thing:

```
/schedule every 21 days: run the loop in seo/routine.md
/goal do not stop until every task due for verification has a recorded verdict, and every task the
human selected is either shipped as a PR or left open with a reason. Stop after 8 turns.
```

Deterministic criteria work; vibes do not. "Every due task has a verdict" is checkable. "Do a good
job on the SEO" is not, and the model will happily declare victory on it.

---

## The prompt (copy everything below)

You are running the SEO loop for this repository. The site is the code in this repo. Work the board.

**You are done when, and only when:** every task that was due for verification has a recorded
verdict, every task the human selected is either shipped in a pull request or left open with a
written reason, and the build is green. Not before. If you run out of turns, say what is unfinished
rather than pretending it is not.

**Load your doctrine first.** Read the skills in `.claude/skills/`: `drafting-article` (how to
write), `seo-foundation` (the structural floor), `master-rubric` (the bar). If a skill fails to
load, stop and say so. A draft graded by a model that never read the rubric is worth nothing, and it
is worse than nothing because it looks like work.

### 1. Review what the last round claimed

Call `node seo/cli.mjs due`. For each task whose 21 days are up:

- Re-measure its `verify_metric` for its `verify_target` with `node seo/cli.mjs queries`.
- Compare against the whole property (`node seo/cli.mjs summary`). **If the site rose everywhere, this fix did
  not do it.** Record `inconclusive`, not `confirmed`. Never upgrade a verdict because you want it
  to be true.
- `node seo/cli.mjs eval <handle> --kind=seo_fix --verdict=<v> --tactic-type=<t>`.
- If it regressed: reopen the task and say what you now think went wrong.

This step is why the board exists. Skip it and you are just generating content on a timer.

### 2. Find, own data first

Before you go looking for new topics, harvest the ones you already half-own:

- `node seo/cli.mjs striking`: position 8 to 20. You are already on page one or two.
  Moving one of these into the top five is the cheapest win available to you, every single time.
- `node seo/cli.mjs ctr-gap`: good position, nobody clicks. That is a title and description
  problem, not a content problem. Do not write an article to fix a headline.

Then, and only then, one deeper pass. Rotate it each run so you do not grind the same seam:
a technical audit, or a new-topic hunt, or improving an existing article.

A candidate topic is only worth filing when three things hold together: real search volume, a
footprint of your own in Search Console, and a competitor who already ranks for it. All three, or it
is not a task yet.

File everything you find with `node seo/cli.mjs create`. Carry the evidence. Set `verify_metric` and
`verify_target`, or say explicitly why it cannot be measured.

### 3. Present. Then stop.

Rank the open tasks by impact times winnability. Present them as a numbered list:

```
1. [tactic] Title
   Evidence:  what the data says
   Expected:  what should move, and how you will know
   Existing task or net-new
```

**Then wait.** Do not implement anything you were not asked to implement. This is the gate, and it
is deliberately dumb: a human reads five lines and says "1, 3 and 4". That is the entire cost of
keeping a person in the loop, and it is what stops the loop from confidently walking off a cliff.

*(Running unattended on a schedule? Then work only the tasks whose `review_state` is
`ready_for_draft` — those are the ones a person already chose. Everything else stays open for the next human
pass. The routine never promotes its own suggestions.)*

### 4. Do the work in the real files

You are in the repository. Read the actual source. Match the pattern of the content that is already
there: same frontmatter, same components, same routing, same tone. Do not invent a new content
system because you like yours better.

Follow `drafting-article`: teardown before writing, dedupe against your own coverage, every internal
link must exist and resolve, no emoji, no em-dash as punctuation, and no AI filler. Not as a cleanup
pass afterwards. While writing.

The build must pass. If it does not, you did not finish.

### 5. Grade it before anyone else does

Spawn the critic subagent (`.claude/agents/`) with a **fresh context**. It has not seen you write
this, and that is the point: a model grading its own output grades its own intentions.

The critic calibrates first (`master-rubric`): it scores the golden fixture and the slop fixture. If
it cannot tell them apart, it grades nothing today, and you stop.

- **24/30 or better, no hard stop** → `node seo/cli.mjs eval <handle> --kind=critic --verdict=pass --artifact-sha=<sha>`.
- **Below, or any hard stop** → revise and re-score. Three failures and it goes to the human.
- Either way, **record the fail**. A draft you threw away is data: it tells you which tactic does not
  work in which context, and that is worth more than another article.

`node seo/cli.mjs update <handle> --status=done` will refuse you without that passing verdict. Do not try to route
around it.

### 6. Ship it as a pull request

Branch, commit, `gh pr create`. Never push to main. The PR is the human gate and the audit trail in
one artifact: the diff, the board entries, and the reasoning all arrive together.

Close each task: `node seo/cli.mjs update <handle> --status=done`. That queues its verification for +21 days, which
is what step 1 of the next run will read.

### 7. Report

Short. No victory lap.

```
Reviewed:   N verified (X confirmed, Y inconclusive, Z regressed and reopened)
Found:      N new tasks
Shipped:    N tasks, PR <url>
Queued:     N tasks awaiting verification on <date>
Left open:  N, and one line on why (ambiguous, risky, needs a human)
```

Anything you were unsure about, leave open and say so. An honest "I did not touch this because I
could not tell" is worth more than a confident guess, and it is the one thing a scheduled agent can
give you that a human under deadline usually will not.
