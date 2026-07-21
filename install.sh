#!/usr/bin/env bash
# Install the loop into YOUR website's repo.
#
#   cd your-website
#   curl -sL https://raw.githubusercontent.com/Dominien/seo-loop-kit/main/install.sh | bash
#
# It drops two directories into your repo and touches nothing else. It appends to
# your .gitignore and your CLAUDE.md rather than replacing them, because clobbering
# someone's package.json is not a good first impression.
set -euo pipefail

REPO="Dominien/seo-loop-kit"
say() { printf '  %s\n' "$1"; }

printf '\n  seo-loop-kit\n\n'

# It has to go IN the repo. That is the whole point: the agent edits your real
# source files and opens a pull request against your real branch. A separate
# clone would just be a very elaborate way of writing articles into a folder
# nobody deploys.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  say "This is not a git repository."
  say "Run it from the root of the website you want to optimise."
  exit 1
fi
if [ "$(git rev-parse --show-toplevel)" != "$PWD" ]; then
  say "Run this from the repository root ($(git rev-parse --show-toplevel))."
  exit 1
fi

for d in seo; do
  if [ -e "$d" ]; then
    say "'$d' already exists. Move it aside first, so nothing of yours is overwritten."
    exit 1
  fi
done

say "Fetching..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -sL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar xz -C "$TMP" --strip-components=1

# Only these two go into your repo. No package.json, no root README, no LICENSE
# of ours sitting on top of yours.
mkdir -p .claude/skills .claude/agents
cp -R "$TMP/seo" .
cp -R "$TMP/.claude/skills/." .claude/skills/
cp -R "$TMP/.claude/agents/." .claude/agents/
[ -f .env ] || cp "$TMP/.env.example" .env.example
say "Installed  seo/  and  .claude/"

# Append. Never replace.
if ! grep -q '^\.env$' .gitignore 2>/dev/null; then
  printf '\n# seo-loop-kit\n.env\nboard.db-wal\nboard.db-shm\n' >> .gitignore
  say "Appended to .gitignore  (.env stays out of git; board.db goes IN, it is the memory)"
fi

MARKER='<!-- seo-loop-kit -->'
if ! grep -qF "$MARKER" CLAUDE.md 2>/dev/null; then
  cat >> CLAUDE.md <<'EOF'

<!-- seo-loop-kit -->
## SEO

This repo runs an SEO loop. Before you touch anything SEO related, read `seo/SEO-LOOP.md`.

The short version: `node seo/cli.mjs` is the command surface, `board.db` is the memory,
and the gates in it will refuse you. They are right to.
EOF
  say "Appended to CLAUDE.md  (your existing instructions are untouched)"
fi

printf '\n  Next:\n\n'
say "1. cp .env.example .env   and fill in your keys"
say "2. node seo/connect.mjs   (one-time Google login)"
say "3. node seo/check.mjs     (tells you what is still missing)"
printf '\n'
say "Then open Claude Code here and say:"
say "  \"read seo/SEO-LOOP.md, then find me something worth fixing\""
printf '\n'
