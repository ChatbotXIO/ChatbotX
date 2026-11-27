import { bloomFilterFactory } from "./bloom-filter"
import { casStoreFactory } from "./cas-store"
import { concurrencySlotsFactory as makeConcurrencySlots } from "./concurrency-slots"
import { cacheConnections } from "./connections/cache-connection"
import { distributedLockFactory } from "./distributed-lock"
import { distributedStoreFactory } from "./distributed-store"
import { leaderboardStoreFactory } from "./leaderboard-store"
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

export { concurrencySlotsFactory } from "./concurrency-slots"
export const concurrencySlots = makeConcurrencySlots(
  cacheConnections.useExisting,
)

export { cacheConnections } from "./connections/cache-connection"
export type {
  LeaderboardRankEntry,
  LeaderboardStats,
  LeaderboardStore,
} from "./leaderboard-store"
export {
  decodeRankValue,
  encodeRankValue,
  leaderboardKeys,
  leaderboardStoreFactory,
  tieSecondsSince,
} from "./leaderboard-store"
export const leaderboardStore = leaderboardStoreFactory(
  cacheConnections.useExisting,
)
export {
  type DistributedLock,
  distributedLockFactory,
  isLockAcquisitionError,
} from "./distributed-lock"
export const distributedLock = distributedLockFactory(cacheConnections.create)
export const distributedStore = distributedStoreFactory(
  cacheConnections.useExisting,
)

export * from "./cache-utils"
export { sequenceConnections } from "./connections/sequence-connection"
export * from "./queue-utils"
export type {
  DeepReadonly,
  ReadCache,
  ReadCacheOptions,
  VersionedValue,
} from "./read-cache"
export { createReadCache } from "./read-cache"
export { createRedisConnection } from "./redis-client"
