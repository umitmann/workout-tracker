import http from 'k6/http'
import { check } from 'k6'

const baseUrl = (__ENV.PT_LOAD_BASE_URL || '').replace(/\/$/, '')
const directoryPath = __ENV.PT_LOAD_DIRECTORY_PATH || '/trainers'
const connectionsPath = __ENV.PT_LOAD_CONNECTIONS_PATH || ''
const calendarPath = __ENV.PT_LOAD_CLIENT_CALENDAR_PATH || ''
const resultsPath = __ENV.PT_LOAD_CLIENT_RESULTS_PATH || ''
const traineeCookie = __ENV.PT_LOAD_TRAINEE_COOKIE || ''
const trainerCookie = __ENV.PT_LOAD_TRAINER_COOKIE || ''
const directoryMarker = __ENV.PT_LOAD_DIRECTORY_MARKER || ''
const connectionsMarker = __ENV.PT_LOAD_CONNECTIONS_MARKER || ''
const calendarMarker = __ENV.PT_LOAD_CALENDAR_MARKER || ''
const resultsMarker = __ENV.PT_LOAD_RESULTS_MARKER || ''

const duration = __ENV.PT_LOAD_DURATION || '2m'

const scenarios = {
  trainer_directory: {
    executor: 'constant-arrival-rate',
    exec: 'trainerDirectory',
    rate: Number(__ENV.PT_LOAD_DIRECTORY_RPS || 10),
    timeUnit: '1s',
    duration,
    preAllocatedVUs: Number(__ENV.PT_LOAD_DIRECTORY_VUS || 20),
    maxVUs: Number(__ENV.PT_LOAD_DIRECTORY_MAX_VUS || 60),
  },
}

const thresholds = {
  'http_req_failed{scenario:trainer_directory}': ['rate<0.01'],
  'http_req_duration{scenario:trainer_directory}': ['p(95)<600', 'p(99)<1200'],
  'checks{scenario:trainer_directory}': ['rate>0.99'],
  dropped_iterations: ['count==0'],
}

if (connectionsPath) {
  scenarios.trainee_connections = {
    executor: 'constant-arrival-rate',
    exec: 'traineeConnections',
    startTime: '5s',
    rate: Number(__ENV.PT_LOAD_CONNECTIONS_RPS || 8),
    timeUnit: '1s',
    duration,
    preAllocatedVUs: Number(__ENV.PT_LOAD_CONNECTIONS_VUS || 16),
    maxVUs: Number(__ENV.PT_LOAD_CONNECTIONS_MAX_VUS || 50),
  }
  thresholds['http_req_failed{scenario:trainee_connections}'] = ['rate<0.01']
  thresholds['http_req_duration{scenario:trainee_connections}'] = ['p(95)<700', 'p(99)<1400']
  thresholds['checks{scenario:trainee_connections}'] = ['rate>0.99']
}

// Later relationship/result phases can opt into their read scenarios without
// making the already-shipped directory load contract depend on future routes.
if (calendarPath) {
  scenarios.client_calendar = {
      executor: 'constant-arrival-rate',
      exec: 'clientCalendar',
      startTime: '5s',
      rate: Number(__ENV.PT_LOAD_CALENDAR_RPS || 15),
      timeUnit: '1s',
      duration,
      preAllocatedVUs: Number(__ENV.PT_LOAD_CALENDAR_VUS || 25),
      maxVUs: Number(__ENV.PT_LOAD_CALENDAR_MAX_VUS || 75),
  }
  thresholds['http_req_failed{scenario:client_calendar}'] = ['rate<0.01']
  thresholds['http_req_duration{scenario:client_calendar}'] = ['p(95)<800', 'p(99)<1500']
  thresholds['checks{scenario:client_calendar}'] = ['rate>0.99']
}

if (resultsPath) {
  scenarios.completed_results = {
      executor: 'constant-arrival-rate',
      exec: 'completedResults',
      startTime: '10s',
      rate: Number(__ENV.PT_LOAD_RESULTS_RPS || 10),
      timeUnit: '1s',
      duration,
      preAllocatedVUs: Number(__ENV.PT_LOAD_RESULTS_VUS || 20),
      maxVUs: Number(__ENV.PT_LOAD_RESULTS_MAX_VUS || 60),
  }
  thresholds['http_req_failed{scenario:completed_results}'] = ['rate<0.01']
  thresholds['http_req_duration{scenario:completed_results}'] = ['p(95)<900', 'p(99)<1800']
  thresholds['checks{scenario:completed_results}'] = ['rate>0.99']
}

export const options = {
  discardResponseBodies: false,
  scenarios,
  thresholds,
}

function requireRuntimeValue(value, name) {
  if (!value) throw new Error(`Missing required load-test environment variable: ${name}`)
  return value
}

function params(cookie, scenario) {
  const traineeSurface = scenario === 'directory' || scenario === 'connections'
  return {
    headers: {
      Cookie: requireRuntimeValue(cookie, `${traineeSurface ? 'PT_LOAD_TRAINEE' : 'PT_LOAD_TRAINER'}_COOKIE`),
      Accept: 'text/html,application/xhtml+xml',
    },
    tags: { surface: scenario },
    redirects: 0,
  }
}

function verify(response, marker, name) {
  check(response, {
    [`${name}: HTTP 200`]: (res) => res.status === 200,
    [`${name}: non-empty response`]: (res) => Boolean(res.body && res.body.length > 0),
    [`${name}: fixture marker present`]: (res) => !marker || String(res.body).includes(marker),
    [`${name}: no server error shell`]: (res) => !String(res.body).includes('Internal Server Error'),
  })
}

export function setup() {
  requireRuntimeValue(baseUrl, 'PT_LOAD_BASE_URL')
  requireRuntimeValue(traineeCookie, 'PT_LOAD_TRAINEE_COOKIE')
  if (calendarPath || resultsPath) requireRuntimeValue(trainerCookie, 'PT_LOAD_TRAINER_COOKIE')
}

export function trainerDirectory() {
  const response = http.get(`${baseUrl}${directoryPath}`, params(traineeCookie, 'directory'))
  verify(response, directoryMarker, 'trainer directory')
}

export function traineeConnections() {
  const response = http.get(
    `${baseUrl}${connectionsPath}`,
    params(traineeCookie, 'connections'),
  )
  verify(response, connectionsMarker, 'trainee connections')
}

export function clientCalendar() {
  const response = http.get(`${baseUrl}${calendarPath}`, params(trainerCookie, 'calendar'))
  verify(response, calendarMarker, 'client calendar')
}

export function completedResults() {
  const response = http.get(`${baseUrl}${resultsPath}`, params(trainerCookie, 'results'))
  verify(response, resultsMarker, 'completed results')
}
