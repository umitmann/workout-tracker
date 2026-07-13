/**
 * WP-17 (finding M12, ADR-0006): CI-runnable behaviour tests infrastructure.
 *
 * This file is the "RED" for WP-17: it cannot boot a live CI runner or a
 * real Supabase instance from this environment, so it verifies the two
 * things that *are* checkable from a clean clone without any secrets:
 *
 *   1. .github/workflows/ci.yml exists and is structurally sound — it runs
 *      lint, tsc, test:unit and test:filters on push, needs no secrets, and
 *      does not reference undefined npm scripts.
 *   2. The headless auth-bootstrap script (.claude/bootstrap-auth.mjs,
 *      replacing the interactive setup-auth.mjs for CI purposes) exposes its
 *      env-contract validation as a pure, unit-testable function.
 *
 * What this file does NOT and CANNOT verify (documented, not silently
 * skipped — see the final report): that the workflow actually goes green on
 * GitHub's runners, or that bootstrap-auth.mjs successfully authenticates
 * against a real Supabase project. Those require infrastructure this sandbox
 * does not have.
 *
 * Run: node --test .claude/test_ci-config.mjs (wired into test:unit)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const ciPath = path.join(repoRoot, '.github/workflows/ci.yml')

// ─── package.json script contract ──────────────────────────────────────────

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'))

// ─── .github/workflows/ci.yml ───────────────────────────────────────────────

test('ci.yml exists', () => {
  assert.ok(existsSync(ciPath), 'expected .github/workflows/ci.yml to exist')
})

function readCi() {
  return readFileSync(ciPath, 'utf-8')
}

test('ci.yml triggers on push (no manual-only / secret-gated trigger)', () => {
  const yml = readCi()
  // Hand-rolled structural check rather than a real YAML parser: this repo
  // has no direct YAML dependency (js-yaml is only a transitive eslint dep),
  // and pulling one in for a single config-lint test is exactly the kind of
  // speculative generality this packet's "simplest thing" mandate rules out.
  const onBlockMatch = yml.match(/^on:\s*\n([\s\S]*?)^\S/m) ?? yml.match(/^on:\s*\n([\s\S]*)$/)
  assert.ok(onBlockMatch, 'ci.yml must have a top-level `on:` block')
  assert.match(onBlockMatch[1], /push:/, 'ci.yml must trigger on push')
})

test('ci.yml runs lint, tsc, test:unit and test:filters', () => {
  const yml = readCi()
  assert.match(yml, /npm run lint\b/, 'ci.yml must run `npm run lint`')
  assert.match(
    yml,
    /npx tsc --noEmit\b/,
    'ci.yml must typecheck with `npx tsc --noEmit` (no `tsc` npm script exists yet)',
  )
  assert.match(yml, /npm run test:unit\b/, 'ci.yml must run `npm run test:unit`')
  assert.match(yml, /npm run test:filters\b/, 'ci.yml must run `npm run test:filters`')
})

test('ci.yml does not reference any env: or secrets: block', () => {
  const yml = readCi()
  // The whole point of WP-17's CI tier is that lint/tsc/test:unit/test:filters
  // need NO secrets. If a future edit adds a `secrets.` reference or a
  // top-level `env:` populated from secrets, that violates the packet.
  assert.doesNotMatch(yml, /secrets\./, 'ci job must not reference any GitHub secret')
})

test('ci.yml only runs npm scripts that exist in package.json', () => {
  const yml = readCi()
  const runCalls = [...yml.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1])
  assert.ok(runCalls.length > 0, 'expected at least one `npm run <script>` in ci.yml')
  for (const script of runCalls) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(pkg.scripts, script),
      `ci.yml runs "npm run ${script}" but no such script exists in package.json`,
    )
  }
})

test('ci.yml checks out the repo and installs with npm ci (reproducible, lockfile-pinned)', () => {
  const yml = readCi()
  assert.match(yml, /actions\/checkout@/, 'ci.yml must check out the repository')
  assert.match(yml, /npm ci\b/, 'ci.yml must install with `npm ci` for reproducibility')
})

// ─── headless auth bootstrap (replaces interactive setup-auth.mjs for CI) ──

const bootstrapPath = path.join(repoRoot, '.claude/bootstrap-auth.mjs')

test('bootstrap-auth.mjs exists', () => {
  assert.ok(existsSync(bootstrapPath), 'expected .claude/bootstrap-auth.mjs to exist')
})

test('bootstrap-auth.mjs exports a pure readTestEnv() that validates the SUPABASE_TEST_* contract', async () => {
  const mod = await import('../.claude/bootstrap-auth.mjs')
  assert.equal(typeof mod.readTestEnv, 'function', 'bootstrap-auth.mjs must export readTestEnv')

  const missing = mod.readTestEnv({})
  assert.equal(missing.ok, false)
  assert.match(missing.error, /SUPABASE_TEST_EMAIL/)

  const partial = mod.readTestEnv({ SUPABASE_TEST_EMAIL: 'a@b.com' })
  assert.equal(partial.ok, false)
  assert.match(partial.error, /SUPABASE_TEST_PASSWORD/)

  const noUrl = mod.readTestEnv({
    SUPABASE_TEST_EMAIL: 'a@b.com',
    SUPABASE_TEST_PASSWORD: 'secret123',
  })
  assert.equal(noUrl.ok, false)
  assert.match(noUrl.error, /BASE_URL/)

  const complete = mod.readTestEnv({
    SUPABASE_TEST_EMAIL: 'a@b.com',
    SUPABASE_TEST_PASSWORD: 'secret123',
    SUPABASE_TEST_BASE_URL: 'http://localhost:3000',
  })
  assert.deepEqual(complete, {
    ok: true,
    email: 'a@b.com',
    password: 'secret123',
    baseUrl: 'http://localhost:3000',
  })
})

test('bootstrap-auth.mjs readTestEnv defaults SUPABASE_TEST_BASE_URL to localhost:3000 when unset but allowed', async () => {
  const mod = await import('../.claude/bootstrap-auth.mjs')
  const result = mod.readTestEnv(
    { SUPABASE_TEST_EMAIL: 'a@b.com', SUPABASE_TEST_PASSWORD: 'secret123' },
    { allowDefaultBaseUrl: true },
  )
  assert.equal(result.ok, true)
  assert.equal(result.baseUrl, 'http://localhost:3000')
})

test('bootstrap-auth.mjs is non-interactive: no readline/prompt usage, no TTY wait', async () => {
  const src = readFileSync(bootstrapPath, 'utf-8')
  assert.doesNotMatch(src, /readline/, 'bootstrap script must not read from stdin/TTY')
  assert.doesNotMatch(src, /prompt\(/)
})
