---
name: seo-foundation
description: Non-negotiable technical and answer-engine hygiene for any page, independent of how well it is written. Covers whether a page can be indexed, whether a crawler reads it without ambiguity, whether it is wired into the site, whether a machine can parse its meaning, and whether an AI answer engine can quote it. Verified against what actually renders, never assumed from the source.
---

# Groundwork under the page

Treat this as wiring, not decoration. Clearing every item here wins nobody over on its own, because
convincing a reader is the job of the writing and the offer. But skip these items and the writing
never gets its chance: an un-indexable page is invisible, an ambiguous one gets misread, and one a
machine cannot parse never gets quoted. So make the wiring sound quickly and by construction, then
put your effort into what sits on top of it.

Two very different readers depend on this wiring. A **search crawler** needs to decide whether the
page belongs in the index and what it covers. An **AI answer engine** — AI Overviews in Google
Search, ChatGPT, Perplexity, Claude — needs to be able to pull a sentence off the page and credit
you for it. The same well-built page satisfies both. The groups below are organised around what each
reader requires, and every claim is checked against **what the browser actually renders**, not
against what the code appears to do.

---

## Trust the rendered page, not your reading of the code

You are working inside the site's own repository, so the files are authoritative and you can edit
them. That is not the same as being allowed to assume the outcome. Deciding "the title is fine"
without opening the page and reading the `<title>` that shipped is guesswork, and guesswork does not
count as a check here. Find the lever in the source, change it, and then confirm the result on the
rendered page.

Common places the levers live:

- **Next.js App Router** keeps the root `metadata`, the `<html lang>` attribute, and one site-wide
  block of JSON-LD in `app/layout.tsx`; each route then declares its own title, description,
  `robots`, `alternates.canonical`, and Open Graph via `metadata` or `generateMetadata`. Crawl
  directives at the header level come from `middleware.ts`, and the two generated endpoints are
  `app/robots.ts` and `app/sitemap.ts`.
- **Astro** — the head, the canonical, and the JSON-LD are emitted from `src/layouts/*.astro`; the
  content collection schema constrains frontmatter; the sitemap comes from the integration; and in
  `astro.config.mjs`, the `site` value is what turns a relative canonical into an absolute one.
- **Static or hand-templated** — look in the shared `<head>` include, plus `robots.txt` and
  `sitemap.xml`.

---

## Group A — will it be indexed at all

A page a search engine declines to index makes every later item moot, so settle this group before
anything else.

- **Catch an unintended `noindex`.** Search the robots meta tag, whatever default the layout applies,
  and any `X-Robots-Tag` set in middleware or at the host. The worst bug on this whole list is a
  `noindex` that survived the move from staging to production, precisely because nothing looks broken
  while the page quietly falls out of the index.
- **Keep the intentional `noindex` where it earns its place.** Login screens, on-site search results,
  and filter permutations should stay out of the index, but leave `follow` enabled so their links
  still pass equity onward.
- **Point each rankable page at itself with an absolute canonical.** The target must be a live
  200 URL, and it must not wobble in trailing slash, letter case, or host. Feed canonical, sitemap,
  robots, and Open Graph from a single base URL so none of them can drift out of agreement.
- **Return truthful status codes.** A page with no content behind it answers 404, not a friendly
  "nothing here" served at 200, which only burns crawl budget as a soft 404. Redirects use 301 or
  308, and never chain or loop.

## Group B — is it unambiguous to a crawler

Once the page can be indexed, remove every reason for a crawler to guess what it is about.

- **A single `<title>`,** distinct across the whole site, in the 50-to-60-character range, leading
  with the main term. Guard against a hard-coded title in a shared layout stamping itself onto every
  route.
- **One meta description per page,** distinct, in the 150-to-160-character range, aimed squarely at
  the query's intent rather than a boilerplate line repeated everywhere. It will not lift your
  ranking, but it is the sales line that decides the click.
- **A lone `<h1>`** carrying the actual subject of the page — never the logo, never a nav label.
  Beneath it, headings descend one level at a time with no gaps. Headings are the skeleton of the
  document; reach for CSS, not a bigger heading tag, when you only want a size change.
- **An accurate `<html lang>`** written in BCP-47 (`en`, `de`, `en-GB`). Leave it off or get it wrong
  and you blur the locale signal and trip up assistive technology.

## Group C — is it connected to the rest of the site

An indexable, unambiguous page still underperforms when nothing points to it and it leads nowhere.

- **Genuine anchors.** Every link is an `<a href>`, or the framework's `<Link href>` — never a
  click handler pretending to be a link. Crawlers walk `href` attributes; they do not fire your
  `onClick`.
- **Anchor text that names its target,** such as "compare the pricing tiers" rather than "click here"
  or "more". That text is a ranking cue for the page on the other end of the link.
- **Reach and no dead ends.** Any page worth ranking is three-ish clicks from the home page, and no
  worthwhile page is left with zero inbound internal links. Google calls out internal linking by
  name as a way to surface content to its AI features, which makes this leverage rather than tidying.
- **Aim at the destination itself,** never at a URL that bounces through a redirect first.
- **`robots.txt`** answers 200, parses cleanly, points to the sitemap by its absolute URL, and leaves
  revenue pages and render-critical assets unblocked.
- **`sitemap.xml`** lists only URLs that are canonical, return 200, and are allowed into the index —
  never a `noindex` entry, a redirect, or a 404 — and each `lastmod` comes from a real content date
  rather than the moment of the build.

## Group D — can a machine parse its meaning

Structured data states the page's meaning outright instead of leaving a crawler to infer it.

Ship valid `application/ld+json`, keep the type honest to what the page actually is, populate the
required fields, and mark up nothing a visitor cannot see.

- On a blog post or article, use `Article` or `BlogPosting` with `headline`, `datePublished`,
  `dateModified`, `author`, `image`, `mainEntityOfPage`.
- Declare `Organization` and `WebSite` a single time for the whole site from the root layout, each
  with its name, url, logo, and `sameAs`.
- Match a `BreadcrumbList` to the breadcrumb the visitor actually sees, in the same order.
- Reserve `LocalBusiness` — name, address, phone — for a real physical location. It pays off well on
  local searches and on "near me" phrasing put to answer engines.
- Add `FAQPage` only where a genuine question-and-answer block helps the reader. The rich result is
  gone, but those pairs are among the easiest things for an answer engine to lift. Do not bank on FAQ
  or HowTo snippets showing up; that appearance was retired.
- Carry Open Graph and Twitter tags: `og:title`, `og:description`, `og:image`, an `og:url` that
  equals the canonical, an `og:type`, and a `summary_large_image` card whose image is roughly 1200 by
  630 and served from an absolute URL.

## Group E — can an answer engine quote it

This reader is the newest, and the one most sites still ignore. An answer engine does not rank you;
it reads the page, extracts the tidiest stand-alone sentence that settles the question, and credits
that sentence to you. Everything below exists to make that sentence effortless to extract.

- **Open with the answer.** The page's central question gets its reply in the opening paragraph,
  phrased as one or two sentences that hold up on their own, ahead of any backstory. The first clean
  reply on the page is usually the one that gets quoted.
- **Write sentences that stand alone.** "A standard passport renewal takes four to six weeks" travels
  intact. "It usually takes a few weeks" does not, because it carries no subject, no figure, and
  nothing to anchor the claim.
- **Turn subheadings into the questions people ask,** and put the reply in the sentence right below
  each one. That mirrors the way an engine slices a page into chunks.
- **Favour hard specifics** — a figure, a named step, a date, a bounded range — over "it depends"
  hedging, which engines skip. Landing a sourced, concrete data point every few paragraphs is what
  earns the citation.
- **Define a term in one clean sentence** wherever the page first uses it. That single sentence is
  what an engine reaches for when the query is definitional.
- **Reach for lists and tables** on anything countable — steps, side-by-side comparisons, criteria.
  A structured block is easy to isolate and tends to be quoted in one piece.

### Do not invent the specifics

The very pull toward being quotable is what tempts a model to fabricate a number. Refuse it. Any
figure, statistic, award, or named fact carries a real source, and an example value is labelled as
an example. Skip the unbacked superlatives and absolutes ("the best", "number one", "guaranteed");
engines discount them and the critic fails on them. A made-up fact dressed as real is an automatic
fail in `master-rubric`, whatever the rest of the score.

None of this is a second draft. The same concrete, sourced, front-loaded prose that persuades a
person is exactly what a machine extracts. You write it once, and two readers benefit.

---

## Sign-off checklist (clear before calling any foundation fix done)

Confirm each one against the **rendered page**, not the diff:

- [ ] Index status clean: no leftover `noindex`; every rankable page carries an absolute canonical
      pointing at itself at a live URL.
- [ ] Titles and descriptions unique per page, in the 50-to-60 and 150-to-160 character bands.
- [ ] One meaningful `<h1>`; the heading levels step down without a gap.
- [ ] `<html lang>` present and correct.
- [ ] Real `<a href>` links with named anchor text; nothing orphaned; nothing pointing at a redirect;
      every internal link comes back 200.
- [ ] JSON-LD valid for the page's type, required fields present, nothing marked up that is invisible.
- [ ] `robots.txt` and `sitemap.xml` both healthy: 200 responses, canonical URLs only, sitemap
      announced in robots.
- [ ] The lead answer sits up top and stands on its own; subheadings read as questions; a real FAQ
      block lives where buyers actually ask things.
- [ ] Sourcing holds: each concrete figure has provenance, example numbers are marked as such, no
      unbacked superlatives.

Then record the work on the board — `seo create` when you find the problem, `seo update` when you
fix it. A foundation fix the board never hears about is invisible to the verification loop, and an
invisible fix counts as no fix.
