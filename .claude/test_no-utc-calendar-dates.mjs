/**
 * Static regression guard for ADR-0005 (WP-06): `toISOString().split('T')[0]`
 * (or the double-quoted variant) is banned for calendar dates anywhere in
 * src/. This is deliberately a source-text check, not a behavioural one —
 * the point is to catch a *reintroduced* UTC-truncation call site before it
 * ships, the same way a lint rule would. `new Date().toISOString()` used for
 * a full timestamp (e.g. `updated_at`) is untouched by this check — only the
 * `.split('T')[0]` truncation idiom is banned.
 *
 * Run: node --import tsx --test .claude/test_no-utc-calendar-dates.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

const BANNED = /\.toISOString\(\)\s*\.\s*(?:split\(\s*['"`]T['"`]\s*\)\s*\[\s*0\s*\]|slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\))/

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (['.ts', '.tsx', '.js', '.mjs'].includes(extname(full))) out.push(full)
  }
  return out
}

test('no toISOString().split("T")[0] calendar-date truncation remains anywhere in src/', () => {
  const offenders = []
  for (const file of walk(SRC_DIR)) {
    const text = readFileSync(file, 'utf8')
    if (BANNED.test(text)) offenders.push(file)
  }
  assert.deepEqual(offenders, [], `found banned UTC-truncation idiom in: ${offenders.join(', ')}`)
})

test('sanity: the banned-pattern regex actually matches the historical offending idiom', () => {
  assert.equal(BANNED.test("new Date().toISOString().split('T')[0]"), true)
  assert.equal(BANNED.test('new Date().toISOString().split("T")[0]'), true)
  // Must NOT flag a full-timestamp toISOString() with no truncation (notes.ts updated_at).
  assert.equal(BANNED.test('new Date().toISOString().slice(0, 10)'), true)
  assert.equal(BANNED.test('new Date().toISOString().substring(0, 10)'), true)
  assert.equal(BANNED.test('new Date().toISOString()'), false)
})
