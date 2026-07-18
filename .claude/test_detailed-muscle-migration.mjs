import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const path = new URL('../supabase/migrations/20260718001000_detailed_exercise_muscles.sql', import.meta.url)
const sql = readFileSync(path, 'utf8')

function functionBlock(signature) {
  const start = sql.toLowerCase().indexOf(`create or replace function ${signature}`.toLowerCase())
  assert.ok(start >= 0, `missing ${signature}`)
  const end = sql.indexOf('$function$;', start)
  assert.ok(end > start, `unterminated ${signature}`)
  return sql.slice(start, end + '$function$;'.length)
}

test('migration is additive and preserves broad muscle metadata', () => {
  assert.match(sql, /add column if not exists muscles_detailed text\[\]/i)
  assert.match(sql, /add column if not exists muscles_secondary_detailed text\[\]/i)
  assert.doesNotMatch(sql, /drop\s+(?:column|table).*muscles/i)
  assert.doesNotMatch(sql, /update public\.exercises[\s\S]*set\s+muscles\s*=/i)
})

test('taxonomy is private and contains both complete OpenSim inventories', () => {
  assert.match(sql, /create table if not exists private\.exercise_muscle_taxonomy/i)
  assert.match(sql, /revoke all on table private\.exercise_muscle_taxonomy[\s\S]*PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /RajagopalLaiUhlrich2023/)
  assert.match(sql, /StanfordVAUpperExtremity/)
  assert.match(sql, /glmax3/)
  assert.match(sql, /EDCI/)
})

test('versioned catalog and trainer-save RPCs are hardened', () => {
  const list = functionBlock('public.list_available_exercises_v3()')
  const save = functionBlock('public.save_trainer_exercise_v2')
  for (const block of [list, save]) {
    assert.match(block, /security definer/i)
    assert.match(block, /set search_path = ''/i)
    assert.match(block, /auth\.uid\(\)/i)
  }
  assert.match(list, /muscles_detailed text\[\]/i)
  assert.match(list, /muscles_secondary_detailed text\[\]/i)
  assert.match(save, /p_muscles_detailed text\[\]/i)
  assert.match(save, /p_muscles_secondary_detailed text\[\]/i)
  assert.match(sql, /revoke all on function public\.list_available_exercises_v3\(\)[\s\S]*PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function public\.list_available_exercises_v3\(\) to authenticated/i)
})

test('backfill covers all existing exercises without inventing broad replacements', () => {
  assert.match(sql, /create or replace function private\.derive_detailed_muscles/i)
  assert.match(sql, /update public\.exercises as exercise/i)
  assert.match(sql, /where exercise\.muscles_detailed is null[\s\S]*or exercise\.muscles_secondary_detailed is null/i)
  assert.match(sql, /detailed_muscle_coverage_complete/i)
  assert.match(sql, /stored_workout_count/i)
  assert.match(sql, /stored_set_count/i)
})
