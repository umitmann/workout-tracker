/**
 * Hand-rolled recording fake of the Supabase client surface used by
 * src/app/actions/*.ts (WP-01 · ADR-0006).
 *
 * Supports: auth.getUser(); from(table).select/insert/update/delete()
 * chains with .eq()/.not()/.in()/.order()/.single(); rpc(name, args);
 * records every mutation call (insert/update/delete/rpc) with table, method,
 * and the filters/payload applied, in call order, so tests can assert
 * atomicity ("no delete before insert failed") and guard behaviour ("zero
 * mutations on auth/ownership failure").
 *
 * Configuration is per-instance:
 *   createFakeSupabaseClient({
 *     user: { id: 'u1' } | null,
 *     // per-table select responses, consulted in order, or a single object
 *     selectResults: { workouts: { data: { id: 1 }, error: null } },
 *     // per-table mutation results — support functions for dynamic behaviour
 *     insertResults: { sets: { data: null, error: { message: 'boom' } } },
 *     updateResults: {},
 *     deleteResults: {},
 *     // per-function RPC results, same shape as *Results above, keyed by
 *     // function name instead of table (client.rpc('save_workout_sets', args))
 *     rpcResults: { save_workout_sets: { data: null, error: null } },
 *   })
 *
 * Every config value may be:
 *   - a plain { data, error } result, reused for every call to that table
 *   - an array of results, consumed one per call (last one repeats when exhausted)
 *   - a function (call) => { data, error }, invoked with the recorded call
 */

function toResultProvider(config) {
  if (typeof config === 'function') return config
  if (Array.isArray(config)) {
    let i = 0
    return () => {
      const result = config[Math.min(i, config.length - 1)] ?? { data: null, error: null }
      i++
      return result
    }
  }
  if (config && typeof config === 'object') {
    return () => config
  }
  return () => ({ data: null, error: null })
}

class FakeQueryBuilder {
  constructor(client, table, method, payload) {
    this.client = client
    this.table = table
    this.method = method
    this.payload = payload
    this.filters = []
    this._single = false
  }

  eq(column, value) {
    this.filters.push([column, value])
    return this
  }

  // Records as a 3-element filter (['not', column, value]) so it's
  // distinguishable from .eq()'s 2-element form when tests inspect `filters`.
  not(column, operator, value) {
    this.filters.push(['not', column, operator, value])
    return this
  }

  in(column, values) {
    this.filters.push(['in', column, values])
    return this
  }

  order(_column, _opts) {
    return this
  }

  single() {
    this._single = true
    return this._resolve()
  }

  _resolve() {
    const call = {
      table: this.table,
      method: this.method,
      payload: this.payload,
      filters: [...this.filters],
      single: this._single,
    }

    if (this.method !== 'select') {
      this.client.calls.push(call)
    }

    const resultsKey = `${this.method}Results`
    const provider = this.client.providerFor(resultsKey, this.table)
    const result = provider(call)
    return Promise.resolve(result ?? { data: null, error: null })
  }

  select(_columns) {
    // select() on an insert/update chain requests the row back (e.g. .insert().select().single())
    return this
  }

  // Thenable so `await` on a builder without .single() also resolves
  // (mirrors supabase-js behaviour where the query itself is a promise).
  then(onFulfilled, onRejected) {
    return this._resolve().then(onFulfilled, onRejected)
  }
}

class FakeTableClient {
  constructor(client, table) {
    this.client = client
    this.table = table
  }

  select(_columns) {
    return new FakeQueryBuilder(this.client, this.table, 'select', undefined)
  }

  insert(payload) {
    return new FakeQueryBuilder(this.client, this.table, 'insert', payload)
  }

  update(payload) {
    return new FakeQueryBuilder(this.client, this.table, 'update', payload)
  }

  delete() {
    return new FakeQueryBuilder(this.client, this.table, 'delete', undefined)
  }
}

export function createFakeSupabaseClient(config = {}) {
  const providers = new Map()

  const client = {
    config,
    calls: [],
    auth: {
      async getUser() {
        return { data: { user: config.user ?? null }, error: null }
      },
    },
    from(table) {
      return new FakeTableClient(client, table)
    },
    // Supabase RPC surface: client.rpc('fn_name', args). Recorded like a
    // mutation (table set to the function name) so mutationCalls/mutationCount
    // work unchanged — tests assert atomicity/fallback ordering against
    // 'rpc' the same way they do 'insert'/'delete'.
    async rpc(fnName, args) {
      const call = { table: fnName, method: 'rpc', payload: args, filters: [], single: false }
      client.calls.push(call)
      const provider = client.providerFor('rpcResults', fnName)
      const result = provider(call)
      return result ?? { data: null, error: null }
    },
    // Memoized per (resultsKey, table) so array-configured results advance
    // across calls instead of resetting to index 0 on every query.
    providerFor(resultsKey, table) {
      const cacheKey = `${resultsKey}:${table}`
      if (!providers.has(cacheKey)) {
        const configForTable = config[resultsKey]?.[table]
        providers.set(cacheKey, toResultProvider(configForTable))
      }
      return providers.get(cacheKey)
    },
    // Convenience assertions for tests
    mutationCalls(table, method) {
      return client.calls.filter(
        (c) => (table ? c.table === table : true) && (method ? c.method === method : true)
      )
    },
    mutationCount(table, method) {
      return client.mutationCalls(table, method).length
    },
  }
  return client
}
