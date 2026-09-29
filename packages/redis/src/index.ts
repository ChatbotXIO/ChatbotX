import { bloomFilterFactory } from "./bloom-filter"
import { casStoreFactory } from "./cas-store"
import { cacheConnections } from "./connections/cache-connection"
import { sequenceConnections } from "./connections/sequence-connection"
import { distributedLockFactory } from "./distributed-lock"
import { distributedStoreFactory } from "./distributed-store"
import { presenceStoreFactory } from "./presence-store"

export type * from "ioredis"
export type { BloomFilter, BloomFilterOptions } from "./bloom-filter"
export { bloomFilterFactory } from "./bloom-filter"
export const bloomFilter = bloomFilterFactory(cacheConnections.useExisting)

export type { CasStore } from "./cas-store"
export { casStoreFactory } from "./cas-store"
export const casStore = casStoreFactory(cacheConnections.useExisting)

export type { PresenceStore } from "./presence-store"
export { presenceStoreFactory } from "./presence-store"
export const presenceStore = presenceStoreFactory(cacheConnections.useExisting)

export { cacheConnections } from "./connections/cache-connection"
export { distributedLockFactory } from "./distributed-lock"
export const distributedLock = distributedLockFactory(cacheConnections.create)
// Re-exported so callers can catch a failed (non-blocking) lock acquisition
// distinctly from a failure inside the locked `fn` itself, without adding
// `redlock-universal` as a direct dependency of every package that uses
// `distributedLock`.
export { LockAcquisitionError } from "redlock-universal"
export const distributedStore = distributedStoreFactory(
  cacheConnections.useExisting,
)

export { queueConnections } from "./connections/queue-connection"
export { sequenceConnections } from "./connections/sequence-connection"
export { createRedisConnection } from "./redis-client"
export const distributedSequenceStore = distributedStoreFactory(
  sequenceConnections.useExisting,
)

export * from "./cache-utils"
export * from "./queue-utils"
