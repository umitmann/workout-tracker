import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20260714000900_desktop_muscle_generator.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')

function functionBlock(name) {
  const start = sql.indexOf(`create or replace function ${name}`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const end = sql.indexOf('$function$;', start)
  assert.notEqual(end, -1, `unterminated function ${name}`)
  return sql.slice(start, end + '$function$;'.length)
}

test('desktop generator migration adds a versioned read contract without touching history', () => {
  const rpc = functionBlock('public.list_available_exercises_v2')
  assert.match(rpc, /muscles_secondary text\[\]/)
  assert.match(rpc, /exercise\.muscles_secondary/)
  assert.match(rpc, /security definer/)
  assert.match(rpc, /set search_path = ''/)
  assert.match(rpc, /authentication required/)

  assert.doesNotMatch(sql, /(?:delete\s+from|truncate|drop\s+table)\s+public\.(?:workouts|sets|routines|routine_exercises|exercises)\b/i)
  assert.doesNotMatch(sql, /drop\s+function\s+public\.list_available_exercises\(\)/i)
})

test('only authenticated users can execute the v2 catalog RPC', () => {
  assert.match(sql, /revoke all on function public\.list_available_exercises_v2\(\)[\s\S]+PUBLIC, anon, authenticated, service_role;/i)
  assert.match(sql, /grant execute on function public\.list_available_exercises_v2\(\) to authenticated;/i)
  assert.match(sql, /not has_function_privilege\('anon', 'public\.list_available_exercises_v2\(\)', 'execute'\)/)
  assert.match(sql, /not has_function_privilege\('service_role', 'public\.list_available_exercises_v2\(\)', 'execute'\)/)
})
