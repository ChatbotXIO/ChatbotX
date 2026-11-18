import { describe, expect, test, vi } from "vitest"
import { ShardedMessageRepository } from "../src/sharding/message/repository/sharded-message-repository"

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, factory: () => unknown) => factory()),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  distributedLock: { runExclusive: vi.fn() },
}))

const createdAt = new Date("2026-11-18T10:00:00.000Z")

const shardInfo = (id: string) => ({
  shard: { id, physicalId: `physical-${id}` },
  startTime: new Date(0),
  endTime: null,
})

type ShardBehavior = { messageRows: { id: string }[] } | { error: Error }

/**
 * A shard client whose transaction hands the callback a recording `tx`: each
 * `delete(...).where(...)` is logged, so a test sees which tables one shard
 * deleted from, in order, inside the same transaction.
 */
const makeClient = (
  shardId: string,
  behavior: ShardBehavior,
  log: string[],
) => ({
  transaction: async (run: (tx: unknown) => Promise<unknown>) => {
    log.push(`${shardId}:begin`)
    const tx = {
      delete: () => ({
        where: () => {
          log.push(`${shardId}:delete`)
          return {
            // The attachment delete is awaited without `.returning()`.
            // biome-ignore lint/suspicious/noThenProperty: mimics a drizzle query
            then: (resolve: (value: unknown) => void) => resolve(undefined),
            returning: () =>
              "error" in behavior
                ? Promise.reject(behavior.error)
                : Promise.resolve(behavior.messageRows),
          }
        },
      }),
    }
    return await run(tx)
  },
})

const buildRepo = (shards: Record<string, ShardBehavior>) => {
  const log: string[] = []
  const infos = Object.keys(shards).map(shardInfo)
  const clients = new Map(
    Object.entries(shards).map(([id, behavior]) => [
      id,
      makeClient(id, behavior, log),
    ]),
  )
  const shardManager = {
    getShardsForTimeRange: vi.fn().mockResolvedValue(infos),
    getWriteShardInfo: vi.fn().mockResolvedValue(infos[0]),
    getShardClient: vi.fn(async (shard: { id: string }) =>
      clients.get(shard.id),
    ),
  }
  return { repo: new ShardedMessageRepository(shardManager as never), log }
}

describe("ShardedMessageRepository.hardDeleteById", () => {
  test("returns the removed rows when every shard succeeds", async () => {
    const { repo } = buildRepo({
      a: { messageRows: [{ id: "m1" }] },
      b: { messageRows: [] },
    })

    await expect(repo.hardDeleteById("m1", "ws-1", createdAt)).resolves.toEqual(
      [{ id: "m1" }],
    )
  })

  test("a shard that never held the message is not an error", async () => {
    const { repo } = buildRepo({ a: { messageRows: [] } })

    await expect(repo.hardDeleteById("m1", "ws-1", createdAt)).resolves.toEqual(
      [],
    )
  })

  test("throws when a shard fails, so the caller never reports a delete that did not happen", async () => {
    const { repo } = buildRepo({ a: { error: new Error("shard down") } })

    await expect(repo.hardDeleteById("m1", "ws-1", createdAt)).rejects.toThrow(
      "shard down",
    )
  })

  test("removes the attachments and the message in one transaction per shard", async () => {
    const { repo, log } = buildRepo({ a: { messageRows: [{ id: "m1" }] } })

    await repo.hardDeleteById("m1", "ws-1", createdAt)

    expect(log).toEqual(["a:begin", "a:delete", "a:delete"])
  })

  test("still attempts the other shards when one fails, then throws", async () => {
    const { repo, log } = buildRepo({
      a: { error: new Error("shard down") },
      b: { messageRows: [{ id: "m1" }] },
    })

    await expect(repo.hardDeleteById("m1", "ws-1", createdAt)).rejects.toThrow(
      "shard down",
    )
    expect(log).toContain("b:begin")
  })
})
