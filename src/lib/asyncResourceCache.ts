export type ResourceRead<V> =
  | { found: true; value: V }
  | { found: false }

export type AsyncResourceCache<K, V> = {
  read: (key: K) => ResourceRead<V>
  seed: (key: K, value: V) => void
  get: (key: K, loader: () => Promise<V>) => Promise<V>
}

// A component-lifetime cache for authenticated UI queries. It deliberately
// has no browser-storage or server-global backing: values disappear when the
// workout unmounts, so another signed-in account can never inherit them.
export function createAsyncResourceCache<K, V>(): AsyncResourceCache<K, V> {
  const values = new Map<K, V>()
  const pending = new Map<K, Promise<V>>()

  return {
    read(key) {
      return values.has(key)
        ? { found: true, value: values.get(key) as V }
        : { found: false }
    },
    seed(key, value) {
      values.set(key, value)
    },
    get(key, loader) {
      if (values.has(key)) return Promise.resolve(values.get(key) as V)
      const existing = pending.get(key)
      if (existing) return existing

      const request = loader()
        .then((value) => {
          values.set(key, value)
          return value
        })
        .finally(() => pending.delete(key))
      pending.set(key, request)
      return request
    },
  }
}
