import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUTPUT_PATH = path.resolve('.context/pt-load-local.env')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function required(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required local load-test variable: ${name}`)
  return value
}

export function assertLocalAppBaseUrl(rawValue) {
  const url = new URL(rawValue)
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
  if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname)) {
    throw new Error('Local load sessions may target only a loopback application URL.')
  }
  if (url.username || url.password) throw new Error('The application URL must not contain credentials.')
  return url.origin
}

export function readLocalLoadConfig(env) {
  const appBaseUrl = assertLocalAppBaseUrl(required(env, 'PT_E2E_BASE_URL'))
  const relationshipId = required(env, 'PT_PLAN_E2E_RELATIONSHIP_ID').toLowerCase()
  if (!UUID_PATTERN.test(relationshipId)) throw new Error('PT_PLAN_E2E_RELATIONSHIP_ID must be a UUID.')

  const appUrl = new URL(appBaseUrl)
  const dockerBaseUrl = `http://host.docker.internal:${appUrl.port || (appUrl.protocol === 'https:' ? '443' : '80')}`
  return {
    appBaseUrl,
    dockerBaseUrl,
    relationshipId,
    directoryMarker: required(env, 'PT_DIRECTORY_APPROVED_NAME'),
    trainee: {
      email: required(env, 'PT_E2E_TRAINEE_EMAIL'),
      password: required(env, 'PT_E2E_TRAINEE_PASSWORD'),
    },
    trainer: {
      email: required(env, 'PT_PLAN_E2E_TRAINER_EMAIL'),
      password: required(env, 'PT_PLAN_E2E_TRAINER_PASSWORD'),
    },
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

async function authenticatedCookieHeader(browser, baseUrl, credentials) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(baseUrl)
    await page.getByPlaceholder('Email').fill(credentials.email)
    await page.getByPlaceholder('Password').fill(credentials.password)
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 15_000 })
    const cookies = await context.cookies(baseUrl)
    if (cookies.length === 0) throw new Error('Sign-in produced no session cookies.')
    return cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
  } finally {
    await context.close()
  }
}

async function main() {
  const config = readLocalLoadConfig(process.env)
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })

  try {
    const [traineeCookie, trainerCookie] = await Promise.all([
      authenticatedCookieHeader(browser, config.appBaseUrl, config.trainee),
      authenticatedCookieHeader(browser, config.appBaseUrl, config.trainer),
    ])

    const values = {
      PT_LOAD_BASE_URL: config.dockerBaseUrl,
      PT_LOAD_DIRECTORY_PATH: '/trainers',
      PT_LOAD_CONNECTIONS_PATH: '/connections',
      PT_LOAD_CLIENT_CALENDAR_PATH: `/trainer/clients/${config.relationshipId}?view=calendar`,
      PT_LOAD_CLIENT_RESULTS_PATH: `/trainer/clients/${config.relationshipId}?view=results`,
      PT_LOAD_TRAINEE_COOKIE: traineeCookie,
      PT_LOAD_TRAINER_COOKIE: trainerCookie,
      PT_LOAD_DIRECTORY_MARKER: config.directoryMarker,
      PT_LOAD_CONNECTIONS_MARKER: 'Connections and consent',
      PT_LOAD_CALENDAR_MARKER: 'Client calendar',
      PT_LOAD_RESULTS_MARKER: 'Completed workouts',
    }
    const contents = [
      '# Generated disposable local load session. Never commit or use against production.',
      ...Object.entries(values).map(([name, value]) => `export ${name}=${shellQuote(value)}`),
      '',
    ].join('\n')

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    await writeFile(OUTPUT_PATH, contents, { encoding: 'utf8', mode: 0o600 })
    await chmod(OUTPUT_PATH, 0o600)
    console.log(`Created disposable local load session at ${OUTPUT_PATH}`)
  } finally {
    await browser.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Local load-session setup failed.')
    process.exitCode = 1
  })
}
