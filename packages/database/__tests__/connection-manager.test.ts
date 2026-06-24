import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ShardConfig } from "../src/sharding/shared"

const shardMocks = vi.hoisted(() => ({
  createMessageShardClient: vi.fn(),
  createReadShardPool: vi.fn(),
  createShardPool: vi.fn(),
}))

vi.mock("../src/sharding/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/sharding/shared")>()
  return {
    ...actual,
    createReadShardPool: shardMocks.createReadShardPool,
    createShardPool: shardMocks.createShardPool,
  }
})

vi.mock("../src/sharding/message/client", () => ({
  createMessageShardClient: shardMocks.createMessageShardClient,
}))

import { MessageShardConnectionManager } from "../src/sharding/message/connection-manager"

// ---------------------------------------------------------------------------
// getWriteShardInfo — exposes the workspace's write shard as an all-time
// time-range info so read paths can union it in. This guarantees back-dated
// historical-import rows (written into the active shard but outside its
// registered time-range) remain reachable on read.
// ---------------------------------------------------------------------------

const shardRecord = {
  id: "s1",
  name: "shard-1",
  host: "localhost",
  port: 5432,
  database: "shard_db",
  user: "shard_user",
  credentialRef: null,
  isActive: true,
  sslMode: "disable",
  shardKey: null,
  readHost: null,
  readPort: null,
}

function makePool(id: string, query = vi.fn().mockResolvedValue([{ ok: 1 }])) {
  return {
    end: vi.fn().mockResolvedValue(undefined),
    idleCount: 0,
    id,
    query,
    totalCount: 0,
    waitingCount: 0,
  }
}

function makeManager(
  registryOverrides: Record<string, unknown> = {},
  options: { readReplicasEnabled?: boolean } = {},
): MessageShardConnectionManager {
  const registry = {
    countActiveShards: vi.fn().mockResolvedValue(1),
    findShardForWrite: vi.fn().mockResolvedValue(shardRecord),
    ...registryOverrides,
  }
  return new MessageShardConnectionManager(
    {} as never,
    registry as never,
    options,
  )
}

describe("MessageShardConnectionManager.getWriteShardInfo", () => {
  beforeEach(() => {
    shardMocks.createMessageShardClient.mockReset()
    shardMocks.createReadShardPool.mockReset()
    shardMocks.createShardPool.mockReset()
    shardMocks.createMessageShardClient.mockImplementation(
      (pool: { id: string }) => ({ clientId: pool.id }),
    )
  })

  test("maps the workspace write shard to an all-time time-range info", async () => {
    const manager = makeManager()

    const info = await manager.getWriteShardInfo("ws-1")

    expect(info).not.toBeNull()
    expect(info?.shardId).toBe("s1")
    expect(info?.id).toBe("write:s1")
    expect(info?.startTime).toEqual(new Date(0))
    expect(info?.endTime).toBeNull()
    expect(info?.shard.id).toBe("s1")
  })

  test("returns mainDbShardInfo when no shard is assigned to the workspace", async () => {
    const manager = makeManager({
      findShardForWrite: vi.fn().mockResolvedValue(null),
    })

    const info = await manager.getWriteShardInfo("ws-1")

    expect(info).not.toBeNull()
    expect(info?.shardId).toBe(MessageShardConnectionManager.MAIN_DB_SHARD_ID)
    expect(info?.id).toBe(MessageShardConnectionManager.MAIN_DB_SHARD_ID)
    expect(info?.startTime).toEqual(new Date(0))
    expect(info?.endTime).toBeNull()
  })
})

describe("MessageShardConnectionManager.getShardsForTimeRange", () => {
  const start = new Date(0)
  const end = new Date()

  test("returns mainDbShardInfo only when MessageShard table is completely empty", async () => {
    const manager = makeManager({
      findShardsForTimeRange: vi.fn().mockResolvedValue([]),
      countShards: vi.fn().mockResolvedValue(0),
    })

    const shards = await manager.getShardsForTimeRange(start, end)

    expect(shards).toHaveLength(1)
    expect(shards[0].shardId).toBe(
      MessageShardConnectionManager.MAIN_DB_SHARD_ID,
    )
  })

  test("returns empty when any MessageShard record exists but no time range covers the window", async () => {
    // Covers both: isMain=true inactive shard (after --init) and active external shards.
    // ANY record in MessageShard means sharding setup has started — no fallback to main DB.
    const manager = makeManager({
      findShardsForTimeRange: vi.fn().mockResolvedValue([]),
      countShards: vi.fn().mockResolvedValue(1),
    })

    const shards = await manager.getShardsForTimeRange(start, end)

    expect(shards).toHaveLength(0)
  })
})

describe("MessageShardConnectionManager.getShardClient", () => {
  beforeEach(() => {
    shardMocks.createMessageShardClient.mockReset()
    shardMocks.createShardPool.mockReset()
    shardMocks.createMessageShardClient.mockImplementation(
      (pool: { id: string }) => ({ clientId: pool.id }),
    )
  })

  test("returns mainDbShardClient without pool creation when shard has isMain=true", async () => {
    const manager = makeManager()
    const mainShard = { ...shardRecord, isMain: true }

    await manager.getShardClient(mainShard)

    expect(shardMocks.createShardPool).not.toHaveBeenCalled()
    expect(shardMocks.createMessageShardClient).not.toHaveBeenCalled()
  })

  test("creates a pool for regular shards", async () => {
    const manager = makeManager()
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))

    await manager.getShardClient(shardRecord)

    expect(shardMocks.createShardPool).toHaveBeenCalledTimes(1)
  })
})

describe("MessageShardConnectionManager.withShardClientForRead", () => {
  beforeEach(() => {
    shardMocks.createMessageShardClient.mockReset()
    shardMocks.createReadShardPool.mockReset()
    shardMocks.createShardPool.mockReset()
    shardMocks.createMessageShardClient.mockImplementation(
      (pool: { id: string }) => ({ clientId: pool.id }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const readShard = {
    ...shardRecord,
    readHost: "replica",
    readPort: 5432,
  } satisfies ShardConfig

  async function flushBackgroundRetry() {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  test("uses primary even when a read replica is configured while read replicas are disabled by default", async () => {
    const manager = makeManager()
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))

    const usedClient = await manager.withShardClientForRead(
      readShard,
      (client) => Promise.resolve(client),
    )

    expect(usedClient).toEqual({ clientId: "primary" })
    expect(shardMocks.createReadShardPool).not.toHaveBeenCalled()
  })

  test("uses the replica when read replicas are enabled and the health check passes", async () => {
    const manager = makeManager({}, { readReplicasEnabled: true })
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))
    shardMocks.createReadShardPool.mockReturnValue(makePool("read-ok"))

    const usedClient = await manager.withShardClientForRead(
      readShard,
      (client) => Promise.resolve(client),
    )

    expect(usedClient).toEqual({ clientId: "read-ok" })
  })

  test("falls back to primary when enabled replica fails its initial health check", async () => {
    const manager = makeManager({}, { readReplicasEnabled: true })
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))
    const failingReadPool = makePool(
      "read-fail",
      vi.fn().mockRejectedValue(new Error("replica down")),
    )
    shardMocks.createReadShardPool.mockReturnValue(failingReadPool)

    const usedClient = await manager.withShardClientForRead(
      readShard,
      (client) => Promise.resolve(client),
    )

    expect(usedClient).toEqual({ clientId: "primary" })
    expect(failingReadPool.end).toHaveBeenCalled()
  })

  test("reconnects the enabled replica in the background after the retry TTL without blocking the read", async () => {
    vi.stubEnv("SHARD_READ_REPLICA_RETRY_TTL_MS", "0")
    const manager = makeManager({}, { readReplicasEnabled: true })
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))
    const failingReadPool = makePool(
      "read-fail",
      vi.fn().mockRejectedValue(new Error("replica down")),
    )
    const recoveredReadPool = makePool("read-ok")
    shardMocks.createReadShardPool
      .mockReturnValueOnce(failingReadPool)
      .mockReturnValueOnce(recoveredReadPool)

    const first = await manager.withShardClientForRead(readShard, (client) =>
      Promise.resolve(client),
    )
    expect(first).toEqual({ clientId: "primary" })

    await flushBackgroundRetry()

    const second = await manager.withShardClientForRead(readShard, (client) =>
      Promise.resolve(client),
    )
    expect(second).toEqual({ clientId: "read-ok" })
    expect(recoveredReadPool.query).toHaveBeenCalledWith("SELECT 1")
  })

  test("marks the enabled replica unhealthy on a runtime connection error and retries the query on primary", async () => {
    const manager = makeManager({}, { readReplicasEnabled: true })
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))
    const readPool = makePool("read-ok")
    shardMocks.createReadShardPool.mockReturnValue(readPool)

    const seenClients: string[] = []
    const result = await manager.withShardClientForRead(readShard, (client) => {
      const { clientId } = client as unknown as { clientId: string }
      seenClients.push(clientId)
      if (clientId === "read-ok") {
        return Promise.reject(
          Object.assign(new Error("Connection terminated unexpectedly"), {
            code: "ECONNRESET",
          }),
        )
      }
      return Promise.resolve("primary-result")
    })

    expect(result).toBe("primary-result")
    expect(seenClients).toEqual(["read-ok", "primary"])
    expect(readPool.end).toHaveBeenCalled()

    const next = await manager.withShardClientForRead(readShard, (client) =>
      Promise.resolve(client),
    )
    expect(next).toEqual({ clientId: "primary" })
  })

  test("recreates the primary before retrying when the shard entry was evicted mid-read", async () => {
    const manager = makeManager({}, { readReplicasEnabled: true })
    const readPool = makePool("read-ok")
    const evictedPrimaryPool = makePool("primary-evicted")
    const replacementPrimaryPool = makePool("primary-replacement")
    let mainShardPoolCreated = false
    shardMocks.createShardPool.mockImplementation((shard: ShardConfig) => {
      if (shard.id !== readShard.id) {
        return makePool(`primary-${shard.id}`)
      }
      if (mainShardPoolCreated) {
        return replacementPrimaryPool
      }
      mainShardPoolCreated = true
      return evictedPrimaryPool
    })
    shardMocks.createReadShardPool.mockReturnValue(readPool)

    const seenClients: string[] = []
    const result = await manager.withShardClientForRead(readShard, (client) => {
      const { clientId } = client as unknown as { clientId: string }
      seenClients.push(clientId)
      if (clientId === "read-ok") {
        return (async () => {
          for (let index = 0; index < 10; index++) {
            await manager.getShardClient({
              ...readShard,
              id: `other-${index}`,
              readHost: null,
            })
          }
          throw Object.assign(new Error("Connection terminated unexpectedly"), {
            code: "ECONNRESET",
          })
        })()
      }
      return Promise.resolve("primary-result")
    })

    expect(result).toBe("primary-result")
    expect(seenClients).toEqual(["read-ok", "primary-replacement"])
    expect(evictedPrimaryPool.end).toHaveBeenCalled()
  })

  test("does not leave a poisoned entry after a failed primary health check", async () => {
    const manager = makeManager()
    const failingPool = makePool(
      "primary-fail",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    )
    const workingPool = makePool("primary-ok")
    shardMocks.createShardPool
      .mockReturnValueOnce(failingPool)
      .mockReturnValueOnce(workingPool)

    await expect(
      manager.withShardClientForRead(shardRecord, (c) => Promise.resolve(c)),
    ).rejects.toThrow()

    const client = await manager.withShardClientForRead(shardRecord, (c) =>
      Promise.resolve(c),
    )
    expect(client).toEqual({ clientId: "primary-ok" })
    expect(shardMocks.createShardPool).toHaveBeenCalledTimes(2)
  })

  test("returns mainDbShardClient without creating a pool when shard has isMain=true", async () => {
    const manager = makeManager({}, { readReplicasEnabled: true })
    const mainShard = { ...shardRecord, isMain: true }

    const result = await manager.withShardClientForRead(mainShard, () =>
      Promise.resolve("main-result"),
    )

    expect(result).toBe("main-result")
    expect(shardMocks.createShardPool).not.toHaveBeenCalled()
    expect(shardMocks.createMessageShardClient).not.toHaveBeenCalled()
  })

  test("rethrows non-connection errors and keeps the enabled replica healthy", async () => {
    const manager = makeManager({}, { readReplicasEnabled: true })
    shardMocks.createShardPool.mockReturnValue(makePool("primary"))
    const readPool = makePool("read-ok")
    shardMocks.createReadShardPool.mockReturnValue(readPool)

    const sqlError = Object.assign(new Error('column "nope" does not exist'), {
      code: "42703",
    })
    await expect(
      manager.withShardClientForRead(readShard, () => Promise.reject(sqlError)),
    ).rejects.toThrow('column "nope" does not exist')

    expect(readPool.end).not.toHaveBeenCalled()

    const next = await manager.withShardClientForRead(readShard, (client) =>
      Promise.resolve(client),
    )
    expect(next).toEqual({ clientId: "read-ok" })
  })
})
