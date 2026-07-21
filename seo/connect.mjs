#!/usr/bin/env node
// One-time Google OAuth. Opens a browser, catches the callback on localhost,
// exchanges the code, and writes GOOGLE_REFRESH_TOKEN into your .env.
//
// The token never leaves your machine. There is no server in this flow but the
// one that runs for about eight seconds on 127.0.0.1 while you click "Allow".

import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { exec } from 'node:child_process'
import { loadEnv } from './env.mjs'; loadEnv()

const PORT = 4321
const REDIRECT = `http://127.0.0.1:${PORT}/callback`
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

const { GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: SECRET } = process.env

if (!ID || !SECRET) {
  console.error(`
  Missing credentials.

  1. Copy .env.example to .env
  2. console.cloud.google.com -> new project -> enable "Search Console API"
  3. Credentials -> Create OAuth client ID -> Application type: Desktop app
  4. Put the client ID and secret into .env
  5. Run this again.
`)
  process.exit(1)
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on a re-auth
  })

console.log('\n  Opening your browser. Approve the read-only Search Console access.\n')
console.log(`  If nothing opens, paste this:\n\n  ${authUrl}\n`)

const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
exec(`${open} "${authUrl}"`)

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    if (url.pathname !== '/callback') return res.end()

    const err = url.searchParams.get('error')
    const c = url.searchParams.get('code')

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      `<!doctype html><meta charset="utf-8"><title>seo-loop-kit</title>` +
      `<body style="font:16px/1.6 system-ui;max-width:32rem;margin:20vh auto;padding:0 1rem">` +
      (c
        ? `<h1>Connected.</h1><p>Your refresh token has been written to <code>.env</code>. You can close this tab and go back to the terminal.</p>`
        : `<h1>Denied.</h1><p>${err ?? 'No code returned.'}</p>`) +
      `</body>`,
    )

    server.close()
    c ? resolve(c) : reject(new Error(err ?? 'no code'))
  })
  server.listen(PORT)
  setTimeout(() => { server.close(); reject(new Error('Timed out after 3 minutes.')) }, 180_000)
})

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: ID,
    client_secret: SECRET,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  }),
})
if (!res.ok) {
  console.error('\n  Token exchange failed:', await res.text(), '\n')
  process.exit(1)
}
const { refresh_token } = await res.json()
if (!refresh_token) {
  console.error('\n  Google returned no refresh token. Revoke the app at myaccount.google.com/permissions and run this again.\n')
  process.exit(1)
}

const path = '.env'
let env = existsSync(path) ? await readFile(path, 'utf8') : ''
env = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)
  ? env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${refresh_token}`)
  : env.trimEnd() + `\nGOOGLE_REFRESH_TOKEN=${refresh_token}\n`
await writeFile(path, env, 'utf8')

console.log('  Done. Refresh token written to .env.')
console.log('  Now run:  npm run check\n')
