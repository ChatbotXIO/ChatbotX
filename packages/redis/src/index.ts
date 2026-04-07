import { cacheFactory } from "./cache"
import { cacheConnections } from "./connections/cache-connection"
import { sequenceConnections } from "./connections/sequence-connection"
import { distributedLockFactory } from "./distributed-lock"
import { distributedStoreFactory } from "./distributed-store"

export { cacheConnections } from "./connections/cache-connection"
export { distributedLockFactory } from "./distributed-lock"
export const distributedLock = distributedLockFactory(cacheConnections.create)
export const distributedStore = distributedStoreFactory(
  cacheConnections.useExisting,
)
export const cache = cacheFactory(cacheConnections.useExisting)
export type { Cache } from "./cache"

export { queueConnections } from "./connections/queue-connection"
export { sequenceConnections } from "./connections/sequence-connection"
export const distributedSequenceStore = distributedStoreFactory(
  sequenceConnections.useExisting,
)

export * from "./cache-utils"
export * from "./queue-utils"
