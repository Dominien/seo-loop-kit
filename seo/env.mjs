// A .env parser. Twelve lines, so the kit has zero dependencies.
import { readFileSync, existsSync } from 'node:fs'

export function loadEnv(file = '.env') {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const v = m[2].replace(/^["']|["']$/g, '')
    if (v && process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}
