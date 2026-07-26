import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SERVICE_FAILURES = [
  /audit endpoint returned an error/i,
  /invalid json response body/i,
  /\b400 bad request\b/i,
]

export function isAuditServiceFailure(output) {
  return SERVICE_FAILURES.some((pattern) => pattern.test(output))
}

export function runAudit() {
  const result = spawnSync('npm', ['audit', '--audit-level=high'], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)

  if ((result.status ?? 1) === 0) return 0
  if (isAuditServiceFailure(output)) {
    process.stderr.write(
      '::warning::npm advisory service is unavailable; dependency versions remain pinned and the audit will retry on the next CI run.\n',
    )
    return 0
  }
  return result.status ?? 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runAudit()
}
