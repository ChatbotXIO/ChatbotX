/**
 * Data sets whose cached snapshots are fenced by a `CacheVersion` row. Add a
 * namespace here in the same change as the write paths that bump it.
 */
export type CacheVersionNamespace = "template-store"
