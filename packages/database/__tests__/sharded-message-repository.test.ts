import { beforeEach, describe, expect, test, vi } from "vitest"
import { MessageShardUnavailableError } from "../src/errors"
import type {
  BulkCreateAttachmentInput,
  CreateMessageInput,
} from "../src/repositories/message"
import { attachmentModel, messageModel } from "../src/sharding/message"
import { ShardedMessageRepository } from "../src/sharding/message/repository/sharded-message-repository"

// getShardsForRange wraps shard lookups in withCache(); the read path also needs
// distributedLock from the constructor default. Stub the redis module so cache
// reads call straight through to the factory and no real Redis is touched.
vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, factory: () => unknown) => factory()),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  distributedLock: { runExclusive: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Inline mock — ShardedMessageRepository.bulkCreate calls shardManager.getShardForWrite
// then uses the returned db client for inserts.
// ---------------------------------------------------------------------------

function makeShardDbMock() {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn().mockResolvedValue([]),
  }
  chain.values.mockReturnValue(chain)
  chain.onConflictDoNothing.mockReturnValue(chain)
  const insert = vi.fn().mockReturnValue(chain)

  const updateChain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  updateChain.set.mockReturnValue(updateChain)
  const update = vi.fn().mockReturnValue(updateChain)

  return { insert, chain, update, updateChain }
}

function makeShardManagerMock(shardDb: { insert: ReturnType<typeof vi.fn> }) {
  return {
    getShardForWrite: vi.fn().mockResolvedValue(shardDb),
  }
}

function makeMessage(
  overrides: Partial<CreateMessageInput> = {},
): CreateMessageInput {
  return {
    id: "msg-1",
    contactInboxId: "ci-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    messageType: "incoming",
    contentType: "text",
    senderType: "contact",
    sourceId: "src-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ShardedMessageRepository.bulkCreate", () => {
  let repo: ShardedMessageRepository
  let insert: ReturnType<typeof vi.fn>
  let chain: ReturnType<typeof makeShardDbMock>["chain"]
  let update: ReturnType<typeof vi.fn>
  let shardManager: ReturnType<typeof makeShardManagerMock>

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = makeShardDbMock()
    insert = mock.insert
    chain = mock.chain
    update = mock.update
    shardManager = makeShardManagerMock({ insert, update } as never)
    repo = new ShardedMessageRepository(shardManager as never)
  })

  test("conflict target is (contactInboxId, sourceId, createdAt) — TimescaleDB 3-column constraint", async () => {
    await repo.bulkCreate([makeMessage()])

    const [callArg] = chain.onConflictDoNothing.mock.calls[0]
    expect(callArg.target).toHaveLength(3)
    expect(callArg.target).toContain(messageModel.contactInboxId)
    expect(callArg.target).toContain(messageModel.sourceId)
    expect(callArg.target).toContain(messageModel.createdAt)
  })

  test("returns empty array when no messages provided", async () => {
    const result = await repo.bulkCreate([])

    expect(result).toEqual([])
    expect(insert).not.toHaveBeenCalled()
  })

  test("inserts messages and returns { id, sourceId }[]", async () => {
    chain.returning.mockResolvedValue([{ id: "msg-1", sourceId: "src-1" }])

    const result = await repo.bulkCreate([makeMessage()])

    expect(result).toEqual([{ id: "msg-1", sourceId: "src-1" }])
    expect(insert).toHaveBeenCalledTimes(1)
  })

  test("chunks correctly — 2001 messages triggers 3 db.insert calls with correct slice sizes", async () => {
    chain.returning.mockResolvedValue([])
    const messages = Array.from({ length: 2001 }, (_, i) =>
      makeMessage({ id: `msg-${i}`, sourceId: `src-${i}` }),
    )

    await repo.bulkCreate(messages)

    expect(insert).toHaveBeenCalledTimes(3)
    expect(chain.values.mock.calls[0][0]).toHaveLength(1000)
    expect(chain.values.mock.calls[1][0]).toHaveLength(1000)
    expect(chain.values.mock.calls[2][0]).toHaveLength(1)
    expect(chain.values.mock.calls[0][0][0].sourceId).toBe("src-0")
    expect(chain.values.mock.calls[1][0][0].sourceId).toBe("src-1000")
    expect(chain.values.mock.calls[2][0][0].sourceId).toBe("src-2000")
  })

  test("aggregates results from multiple chunks", async () => {
    chain.returning
      .mockResolvedValueOnce([{ id: "msg-0", sourceId: "src-0" }])
      .mockResolvedValueOnce([{ id: "msg-1000", sourceId: "src-1000" }])
      .mockResolvedValueOnce([{ id: "msg-2000", sourceId: "src-2000" }])

    const messages = Array.from({ length: 2001 }, (_, i) =>
      makeMessage({ id: `msg-${i}`, sourceId: `src-${i}` }),
    )

    const result = await repo.bulkCreate(messages)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ id: "msg-0", sourceId: "src-0" })
    expect(result[1]).toEqual({ id: "msg-1000", sourceId: "src-1000" })
    expect(result[2]).toEqual({ id: "msg-2000", sourceId: "src-2000" })
  })

  test("getShardForWrite called with workspaceId from messages", async () => {
    chain.returning.mockResolvedValue([])
    const mock = makeShardDbMock()
    const shardManager = makeShardManagerMock({ insert: mock.insert } as never)
    const localRepo = new ShardedMessageRepository(shardManager as never)

    await localRepo.bulkCreate([makeMessage({ workspaceId: "ws-shard-42" })])

    expect(shardManager.getShardForWrite).toHaveBeenCalledWith("ws-shard-42")
  })

  test("retries when getShardForWrite throws ECONNRESET on first call", async () => {
    vi.useFakeTimers()

    const retryError = Object.assign(new Error("ECONNRESET"), {
      code: "ECONNRESET",
    })
    const retryMock = makeShardDbMock()
    retryMock.chain.returning.mockResolvedValue([
      { id: "msg-1", sourceId: "src-1" },
    ])

    const shardManager = {
      getShardForWrite: vi
        .fn()
        .mockRejectedValueOnce(retryError)
        .mockResolvedValueOnce({ insert: retryMock.insert }),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const resultPromise = localRepo.bulkCreate([makeMessage()])
    await vi.runAllTimersAsync()
    const result = await resultPromise

    vi.useRealTimers()

    expect(shardManager.getShardForWrite).toHaveBeenCalledTimes(2)
    expect(result).toEqual([{ id: "msg-1", sourceId: "src-1" }])
  })

  test("throws when messages span multiple workspaceIds", async () => {
    await expect(
      repo.bulkCreate([
        makeMessage({ workspaceId: "ws-A" }),
        makeMessage({ workspaceId: "ws-B" }),
      ]),
    ).rejects.toThrow(
      "bulkCreate: all messages must belong to the same workspace",
    )
  })

  test("bulkCreateAttachments routes to shard db and passes messageCreatedAt", async () => {
    const msgCreatedAt = new Date("2026-01-01")
    chain.returning.mockResolvedValue([{ id: "att-1" }])

    const input: BulkCreateAttachmentInput = {
      id: "att-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      messageCreatedAt: msgCreatedAt,
      fileType: "image",
      mimeType: "image/png",
      originPath: "/uploads/img.png",
    }

    const result = await repo.bulkCreateAttachments([input])

    expect(shardManager.getShardForWrite).toHaveBeenCalledWith("ws-1")
    expect(insert).toHaveBeenCalledWith(attachmentModel)
    const insertedValues: Record<string, unknown>[] =
      chain.values.mock.calls[0][0]
    expect(insertedValues[0].messageCreatedAt).toEqual(msgCreatedAt)
    expect(result).toEqual([{ id: "att-1" }])
  })

  test("bulkCreateAttachments returns empty array for empty input without calling insert", async () => {
    const result = await repo.bulkCreateAttachments([])

    expect(result).toEqual([])
    expect(insert).toHaveBeenCalledTimes(0)
  })
})

describe("ShardedMessageRepository direct message/attachment lookup helpers", () => {
  const sinceTime = new Date("2026-01-01T00:00:00Z")
  const rangeShard = makeShardInfo("tr:range", "range")
  const writeShard = makeShardInfo("tr:write", "write")

  function makeSelectClient(rows: unknown[]) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    }
    return {
      select: vi.fn().mockReturnValue(chain),
      chain,
    }
  }

  function makeSelectWhereClient(rows: unknown[]) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    }
    return {
      select: vi.fn().mockReturnValue(chain),
      chain,
    }
  }

  function makeUpdateClient() {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }
    const tx = {
      update: vi.fn().mockReturnValue(updateChain),
    }
    return {
      update: vi.fn().mockReturnValue(updateChain),
      updateChain,
      transaction: vi.fn(async (fn: (value: unknown) => Promise<void>) =>
        fn(tx),
      ),
      tx,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("findManyBySourceIds requires sinceTime", async () => {
    const repo = new ShardedMessageRepository({} as never)

    await expect(
      repo.findManyBySourceIds({
        contactInboxIds: ["ci-1"],
        sourceIds: ["src-1"],
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("sinceTime is required")
  })

  test("findManyBySourceIds unions the write shard with time-range shards", async () => {
    const rangeClient = makeSelectWhereClient([
      {
        id: "msg-range",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        sourceId: "src-1",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ])
    const writeClient = makeSelectWhereClient([
      {
        id: "msg-write",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        sourceId: "src-1",
        createdAt: new Date("2025-12-01T00:00:00Z"),
      },
    ])
    const clients = new Map([
      ["range", rangeClient],
      ["write", writeClient],
    ])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      getShardClient: vi.fn((shard: { id: string }) =>
        Promise.resolve(clients.get(shard.id)),
      ),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (value: unknown) => Promise<unknown>) =>
          fn(clients.get(shard.id)),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.findManyBySourceIds({
      contactInboxIds: ["ci-1"],
      sourceIds: ["src-1"],
      workspaceId: "ws-1",
      sinceTime,
    })

    expect(shardManager.getWriteShardInfo).toHaveBeenCalledWith("ws-1")
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(2)
    expect(result.map((row) => row.id)).toEqual(["msg-range", "msg-write"])
  })

  test("bulkPatchContentAttributes requires sinceTime and fans updates across read shards", async () => {
    const rangeClient = makeUpdateClient()
    const writeClient = makeUpdateClient()
    const clients = new Map([
      ["range", rangeClient],
      ["write", writeClient],
    ])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      getShardClient: vi.fn((shard: { id: string }) =>
        Promise.resolve(clients.get(shard.id)),
      ),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (value: unknown) => Promise<unknown>) =>
          fn(clients.get(shard.id)),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    await repo.bulkPatchContentAttributes({
      workspaceId: "ws-1",
      sinceTime,
      patches: [
        {
          contactInboxId: "ci-1",
          sourceId: "src-1",
          overlay: { edited: true },
          text: "edited",
        },
      ],
    })

    expect(shardManager.getShardClient).toHaveBeenCalledTimes(2)
    expect(shardManager.withShardClientForRead).not.toHaveBeenCalled()
    expect(rangeClient.transaction).toHaveBeenCalledTimes(1)
    expect(writeClient.transaction).toHaveBeenCalledTimes(1)
    expect(rangeClient.tx.update).toHaveBeenCalledWith(messageModel)
    expect(rangeClient.updateChain.set.mock.calls[0][0]).toMatchObject({
      text: "edited",
    })

    await expect(
      repo.bulkPatchContentAttributes({
        workspaceId: "ws-1",
        patches: [{ contactInboxId: "ci-1", sourceId: "src-1", overlay: {} }],
      } as never),
    ).rejects.toThrow("sinceTime is required")
  })

  test("findAttachmentById falls back from write shard to read shards and returns createdAt", async () => {
    const attachment = {
      id: "att-1",
      originPath: "wa-media:123",
      mimeType: "image/png",
      createdAt: new Date("2026-01-03T00:00:00Z"),
    }
    const writeClient = makeSelectClient([])
    const rangeClient = makeSelectClient([attachment])
    const clients = new Map([["range", rangeClient]])
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(writeClient),
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (value: unknown) => Promise<unknown>) =>
          fn(clients.get(shard.id)),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.findAttachmentById({
      id: "att-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(attachment)
    expect(shardManager.getShardForWrite).toHaveBeenCalledWith("ws-1")
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(1)
  })

  test("updateAttachment fans across read shards and includes createdAt for pruning", async () => {
    const createdAt = new Date("2026-01-03T00:00:00Z")
    const rangeClient = makeUpdateClient()
    const writeClient = makeUpdateClient()
    const clients = new Map([
      ["range", rangeClient],
      ["write", writeClient],
    ])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      getShardClient: vi.fn((shard: { id: string }) =>
        Promise.resolve(clients.get(shard.id)),
      ),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (value: unknown) => Promise<unknown>) =>
          fn(clients.get(shard.id)),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    await repo.updateAttachment({
      id: "att-1",
      workspaceId: "ws-1",
      createdAt,
      fields: {
        originPath: "workspace/a/att-1.png",
        mimeType: "image/png",
        size: 0,
      },
    })

    expect(shardManager.getShardClient).toHaveBeenCalledTimes(2)
    expect(shardManager.withShardClientForRead).not.toHaveBeenCalled()
    expect(rangeClient.update).toHaveBeenCalledWith(attachmentModel)
    expect(rangeClient.updateChain.set.mock.calls[0][0]).toMatchObject({
      originPath: "workspace/a/att-1.png",
      mimeType: "image/png",
      size: 0,
    })
    expect(rangeClient.updateChain.where).toHaveBeenCalled()
  })

  test("findRichResponseByButton falls back to button lookup when inbound message id has no rich response", async () => {
    const richResponse = {
      executionId: "exec-1",
      buttonPayloads: {
        "button-1": {
          executionId: "exec-1",
          buttonId: "button-1",
          payload: { type: "text", text: "size_s" },
        },
      },
    }
    let selectCall = 0
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) {
          return Promise.resolve([{ contentAttributes: {} }])
        }
        return Promise.resolve([
          {
            id: "outbound-msg-1",
            createdAt: new Date("2026-06-28T14:59:00Z"),
            contentAttributes: { richResponse },
          },
        ])
      }),
    }
    const client = {
      select: vi.fn().mockReturnValue(chain),
    }
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (value: unknown) => Promise<unknown>) =>
          fn(client),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.findRichResponseByButton({
      buttonId: "button-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      messageId: "inbound-msg-1",
      workspaceId: "ws-1",
      sinceTime,
    })

    expect(result).toEqual(richResponse)
    expect(client.select).toHaveBeenCalledTimes(2)
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(2)
  })

  test("findRichResponseByButton returns null when message rich response lacks the requested button", async () => {
    const richResponse = {
      executionId: "exec-1",
      buttonPayloads: {
        "other-button": {
          executionId: "exec-1",
          buttonId: "other-button",
          payload: { type: "text", text: "other" },
        },
      },
    }
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          contentAttributes: { richResponse },
        },
      ]),
    }
    const client = {
      select: vi.fn().mockReturnValue(chain),
    }
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (value: unknown) => Promise<unknown>) =>
          fn(client),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.findRichResponseByButton({
      buttonId: "button-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      messageId: "inbound-msg-1",
      workspaceId: "ws-1",
      sinceTime,
    })

    expect(result).toBeNull()
    expect(client.select).toHaveBeenCalledTimes(1)
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// listByConversation — write-shard union (historical-import regression)
//
// Writes route by workspace hash and keep each message's original createdAt, so
// back-dated imports land in the active write shard even though its registered
// time-range starts at activation. A purely time-based read excludes that shard
// when the query window predates activation — hiding rows that exist. The repo
// must always union the workspace write shard into the read set.
// ---------------------------------------------------------------------------

type ReadMessage = {
  id: string
  conversationId: string
  workspaceId: string
  createdAt: Date
  text: string
}

/**
 * Mock shard client for the read path. queryShardForMessages calls select()
 * twice: first the message query (.from().where().limit().orderBy() resolves),
 * then the attachment query (.from().where() resolves).
 */
function makeReadShardClient(messages: ReadMessage[]) {
  let selectCall = 0
  const select = vi.fn(() => {
    selectCall++
    if (selectCall === 1) {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(messages),
      }
      return chain
    }
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }
    return chain
  })
  return { select }
}

function makeShardInfo(timeRangeId: string, shardId: string) {
  return {
    id: timeRangeId,
    shardId,
    startTime: new Date(0),
    endTime: null,
    shard: {
      id: shardId,
      name: shardId,
      host: "localhost",
      port: 5432,
      database: "shard_db",
      user: "shard_user",
    },
  }
}

function objectContainsValue(value: unknown, expected: string): boolean {
  const seen = new WeakSet<object>()
  const visit = (current: unknown): boolean => {
    if (current === expected) {
      return true
    }
    if (typeof current !== "object" || current === null) {
      return false
    }
    if (seen.has(current)) {
      return false
    }
    seen.add(current)
    if (Array.isArray(current)) {
      return current.some(visit)
    }
    return Object.values(current as Record<string, unknown>).some(visit)
  }
  return visit(value)
}

describe("ShardedMessageRepository.updateSourceId", () => {
  const createdAt = new Date("2026-01-01T00:00:00Z")
  const rangeShard = makeShardInfo("tr:range", "range")
  const writeShard = makeShardInfo("tr:write", "write")

  function makeUpdateClient(rows: unknown[]) {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(rows),
    }
    return { update: vi.fn().mockReturnValue(chain), chain }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("routes by the message's createdAt shard, not the current write shard", async () => {
    // Regression: updateSourceId used to hit getShardForWrite (the currently
    // active write shard) regardless of where the message actually lives,
    // so the update silently missed rows created before the shard rotated.
    const rangeClient = makeUpdateClient([{ id: "msg-1" }])
    const writeClient = makeUpdateClient([])
    const clients = new Map([
      ["range", rangeClient],
      ["write", writeClient],
    ])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      getShardClient: vi.fn((shard: { id: string }) =>
        Promise.resolve(clients.get(shard.id)),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.updateSourceId(
      "msg-1",
      "prov-abc",
      "ws-1",
      createdAt,
    )

    expect(shardManager.getShardsForTimeRange).toHaveBeenCalledWith(
      createdAt,
      new Date("2026-01-01T00:59:59.999Z"),
    )
    expect(shardManager.getWriteShardInfo).toHaveBeenCalledWith("ws-1")
    expect(rangeClient.update).toHaveBeenCalledWith(messageModel)
    expect(rangeClient.chain.set).toHaveBeenCalledWith({
      sourceId: "prov-abc",
    })
    expect(result).toEqual({ id: "msg-1" })
  })

  test("swallows a shard-level failure instead of throwing", async () => {
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([rangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      getShardClient: vi
        .fn()
        .mockRejectedValue(new Error("connection refused")),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    await expect(
      repo.updateSourceId("msg-1", "prov-abc", "ws-1", createdAt),
    ).resolves.toBeNull()
  })
})

describe("ShardedMessageRepository.listByConversation — write-shard union", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns back-dated message from the write shard even when time-range selection is empty", async () => {
    const historicalCreatedAt = new Date("2026-03-10T00:00:00Z")
    const message: ReadMessage = {
      id: "msg-hist-1",
      conversationId: "conv-1",
      workspaceId: "ws-1",
      createdAt: historicalCreatedAt,
      text: "old imported message",
    }
    const shardClient = makeReadShardClient([message])
    const writeShard = makeShardInfo("write:s1", "s1")

    const shardManager = {
      // Time-range registry excludes the shard: query window predates activation.
      getShardsForTimeRange: vi.fn().mockResolvedValue([]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (client: unknown) => Promise<unknown>) =>
          fn(shardClient),
      ),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const result = await localRepo.listByConversation({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      sinceTime: new Date("2026-03-01T00:00:00Z"),
      pagination: {
        limit: 20,
        cursor: { createdAt: new Date("2026-03-10T01:00:00Z"), id: "" },
      },
    })

    expect(shardManager.getWriteShardInfo).toHaveBeenCalledWith("ws-1")
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe("msg-hist-1")
  })

  test("does not double-query when the write shard is already in the time-range set", async () => {
    const message: ReadMessage = {
      id: "msg-1",
      conversationId: "conv-1",
      workspaceId: "ws-1",
      createdAt: new Date("2026-06-05T00:00:00Z"),
      text: "recent",
    }
    const shardClient = makeReadShardClient([message])
    // Same underlying shard id "s1" in both the time-range row and the write shard.
    const timeRangeShard = makeShardInfo("tr:s1", "s1")
    const writeShard = makeShardInfo("write:s1", "s1")

    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([timeRangeShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (client: unknown) => Promise<unknown>) =>
          fn(shardClient),
      ),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const result = await localRepo.listByConversation({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      sinceTime: new Date("2026-06-01T00:00:00Z"),
      pagination: {
        limit: 20,
        cursor: { createdAt: new Date("2026-06-05T01:00:00Z"), id: "" },
      },
    })

    // Deduped by shard id → the single shard is queried exactly once.
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(1)
    expect(result.data).toHaveLength(1)
  })

  test("returns empty when neither time-range nor write shard yields a shard", async () => {
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const result = await localRepo.listByConversation({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      sinceTime: new Date("2026-03-01T00:00:00Z"),
      pagination: {
        limit: 20,
        cursor: { createdAt: new Date("2026-03-10T01:00:00Z"), id: "" },
      },
    })

    expect(result).toEqual({ data: [], nextCursor: null })
    expect(shardManager.withShardClientForRead).not.toHaveBeenCalled()
  })
})

describe("ShardedMessageRepository.listIncomingTextsByContactInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeIncomingTextsShardClient(
    batches: { id: string; createdAt: Date; text: string | null }[][],
  ) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      orderBy: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    }
    const pendingBatches = [...batches]
    chain.limit.mockImplementation((limit: number) => {
      const batch = pendingBatches.shift() ?? []
      return Promise.resolve(batch.slice(0, limit))
    })
    return { select: vi.fn().mockReturnValue(chain), chain }
  }

  test("does not duplicate messages when the registry reports the same physical shard twice", async () => {
    // A shard that was archived and later reactivated gets a second
    // MessageShardTimeRange history row — findShardsForTimeRange legitimately
    // returns two rows that both point at the same physical shard "s1".
    const rows = [
      { id: "m2", createdAt: new Date("2026-06-05T10:00:00Z"), text: "me" },
      { id: "m1", createdAt: new Date("2026-06-05T09:00:00Z"), text: "loop" },
    ]
    const shardClient = makeIncomingTextsShardClient([rows])
    const timeRangeShardA = makeShardInfo("tr:s1-a", "s1")
    const timeRangeShardB = makeShardInfo("tr:s1-b", "s1")
    const writeShard = makeShardInfo("write:s1", "s1")

    const shardManager = {
      getShardsForTimeRange: vi
        .fn()
        .mockResolvedValue([timeRangeShardA, timeRangeShardB]),
      getWriteShardInfo: vi.fn().mockResolvedValue(writeShard),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (client: unknown) => Promise<unknown>) =>
          fn(shardClient),
      ),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const result = await localRepo.listIncomingTextsByContactInbox({
      contactInboxId: "ci-1",
      limit: 200,
      workspaceId: "ws-1",
      sinceTime: new Date("2026-06-01T00:00:00Z"),
    })

    // Deduped by physical shard id → queried once, texts appear exactly once.
    expect(shardManager.withShardClientForRead).toHaveBeenCalledTimes(1)
    expect(shardClient.chain.limit).toHaveBeenCalledWith(200)
    expect(result).toEqual(["me", "loop"])
  })

  test("stops after enough rows without querying older shards", async () => {
    const duplicated = {
      id: "m2",
      createdAt: new Date("2026-06-05T10:00:00Z"),
      text: "me",
    }
    const clients = new Map([
      ["a", makeIncomingTextsShardClient([[duplicated]])],
      [
        "b",
        makeIncomingTextsShardClient([
          [
            duplicated,
            {
              id: "m1",
              createdAt: new Date("2026-06-05T09:00:00Z"),
              text: "loop",
            },
          ],
        ]),
      ],
    ])
    const shardA = makeShardInfo("tr:a", "a")
    const shardB = makeShardInfo("tr:b", "b")
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shardA, shardB]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (client: unknown) => Promise<unknown>) =>
          fn(clients.get(shard.id)),
      ),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const result = await localRepo.listIncomingTextsByContactInbox({
      contactInboxId: "ci-1",
      limit: 1,
      workspaceId: "ws-1",
      sinceTime: new Date("2026-06-01T00:00:00Z"),
    })

    expect(result).toEqual(["me"])
    expect(clients.get("b")?.chain.limit).toHaveBeenCalledWith(1)
    expect(clients.get("a")?.chain.limit).not.toHaveBeenCalled()
    const whereArg = clients.get("b")?.chain.where.mock.calls[0][0]
    expect(objectContainsValue(whereArg, "contactInboxId")).toBe(true)
    expect(objectContainsValue(whereArg, "ci-1")).toBe(true)
    expect(objectContainsValue(whereArg, "messageType")).toBe(true)
    expect(objectContainsValue(whereArg, "incoming")).toBe(true)
  })

  test("reads unbounded exports in sequential chunks of at most 1000 rows per shard", async () => {
    const firstBatch = Array.from({ length: 1000 }, (_, index) => ({
      id: `${2000 - index}`,
      createdAt: new Date(
        `2026-06-05T10:${String(index % 60).padStart(2, "0")}:00Z`,
      ),
      text: `new-${index}`,
    }))
    const secondBatch = [
      {
        id: "999",
        createdAt: new Date("2026-06-05T09:00:00Z"),
        text: "new-last",
      },
    ]
    const olderBatch = [
      { id: "10", createdAt: new Date("2026-06-04T09:00:00Z"), text: "old" },
    ]
    const clients = new Map([
      ["older", makeIncomingTextsShardClient([olderBatch])],
      ["newer", makeIncomingTextsShardClient([firstBatch, secondBatch])],
    ])
    const callOrder: string[] = []
    const olderShard = makeShardInfo("tr:older", "older")
    const newerShard = makeShardInfo("tr:newer", "newer")
    const shardManager = {
      getShardsForTimeRange: vi
        .fn()
        .mockResolvedValue([olderShard, newerShard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        async (
          shard: { id: string },
          fn: (client: unknown) => Promise<unknown>,
        ) => {
          callOrder.push(shard.id)
          return await fn(clients.get(shard.id))
        },
      ),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    const result = await localRepo.listIncomingTextsByContactInbox({
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      sinceTime: new Date("2026-06-01T00:00:00Z"),
    })

    expect(callOrder).toEqual(["newer", "older"])
    expect(clients.get("newer")?.chain.limit).toHaveBeenNthCalledWith(1, 1000)
    expect(clients.get("newer")?.chain.limit).toHaveBeenNthCalledWith(2, 1000)
    expect(clients.get("older")?.chain.limit).toHaveBeenCalledWith(1000)
    expect(result).toHaveLength(1002)
    expect(result[0]).toBe("new-0")
    expect(result.at(-1)).toBe("old")
  })
})

describe("ShardedMessageRepository.hardDeleteAllByContactInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeHardDeleteShardClient() {
    const attachmentSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }
    const attachmentDeleteChain = {
      where: vi.fn().mockResolvedValue(undefined),
    }
    const messageDeleteChain = {
      where: vi.fn().mockResolvedValue(undefined),
    }
    return {
      delete: vi
        .fn()
        .mockReturnValueOnce(attachmentDeleteChain)
        .mockReturnValueOnce(messageDeleteChain),
      select: vi.fn().mockReturnValueOnce(attachmentSelectChain),
      attachmentDeleteChain,
      attachmentSelectChain,
      messageDeleteChain,
    }
  }

  test("scopes hard delete by contact inbox", async () => {
    const shardClient = makeHardDeleteShardClient()
    const shard = makeShardInfo("tr:s1", "s1")
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      getShardClient: vi.fn().mockResolvedValue(shardClient),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    await localRepo.hardDeleteAllByContactInbox({
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      sinceTime: new Date("2026-06-01T00:00:00Z"),
    })

    const attachmentSelectWhereArg =
      shardClient.attachmentSelectChain.where.mock.calls[0][0]
    const deleteWhereArg = shardClient.messageDeleteChain.where.mock.calls[0][0]
    expect(
      objectContainsValue(attachmentSelectWhereArg, "contactInboxId"),
    ).toBe(true)
    expect(objectContainsValue(attachmentSelectWhereArg, "ci-1")).toBe(true)
    expect(objectContainsValue(deleteWhereArg, "contactInboxId")).toBe(true)
    expect(objectContainsValue(deleteWhereArg, "ci-1")).toBe(true)
    expect(objectContainsValue(attachmentSelectWhereArg, "conv-1")).toBe(false)
    expect(objectContainsValue(deleteWhereArg, "conv-1")).toBe(false)
  })

  test("rejects when a shard delete fails so the privacy link can be retried", async () => {
    const shard = makeShardInfo("tr:s1", "s1")
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      getShardClient: vi.fn().mockRejectedValue(new Error("shard down")),
    }
    const localRepo = new ShardedMessageRepository(shardManager as never)

    await expect(
      localRepo.hardDeleteAllByContactInbox({
        contactInboxId: "ci-1",
        workspaceId: "ws-1",
        sinceTime: new Date("2026-06-01T00:00:00Z"),
      }),
    ).rejects.toThrow("Message shard operation failed")
  })
})

describe("ShardedMessageRepository.findById", () => {
  test("scopes message lookup by workspaceId", async () => {
    const createdAt = new Date("2026-06-01T00:00:00Z")
    const message = {
      id: "msg-1",
      conversationId: "conv-1",
      workspaceId: "ws-1",
      createdAt,
      text: "scoped message",
    }
    const shardClient = makeReadShardClient([message])
    const shard = makeShardInfo("tr:s1", "s1")
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (client: unknown) => Promise<unknown>) =>
          fn(shardClient),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    await repo.findById({
      id: "msg-1",
      createdAt,
      workspaceId: "ws-1",
    } as never)

    const messageSelect = shardClient.select.mock.results[0].value
    expect(messageSelect.where).toHaveBeenCalled()
    const whereArg = messageSelect.where.mock.calls[0][0]
    expect(objectContainsValue(whereArg, "workspaceId")).toBe(true)
  })
})

function makeConversationReadClient(messages: ReadMessage[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(messages),
  }
  return { select: vi.fn().mockReturnValue(chain), chain }
}

describe("ShardedMessageRepository complete conversation reads", () => {
  const sinceTime = new Date("2026-01-01T00:00:00Z")
  const shardA = makeShardInfo("tr:a", "a")
  const shardB = makeShardInfo("tr:b", "b")

  test("merges equal timestamps by numeric bigint id", async () => {
    const createdAt = new Date("2026-06-01T00:00:00Z")
    const clients = new Map([
      [
        "a",
        makeConversationReadClient([{ id: "9", createdAt } as ReadMessage]),
      ],
      [
        "b",
        makeConversationReadClient([{ id: "10", createdAt } as ReadMessage]),
      ],
    ])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shardA, shardB]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (client: unknown) => Promise<unknown>) =>
          fn(clients.get(shard.id)),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.findManyByConversation("conv-1", {
      limit: 10,
      sinceTime,
      workspaceId: "ws-1",
    })

    expect(result.map((message) => message.id)).toEqual(["10", "9"])
  })

  test.each([
    "findLastByConversation",
    "findManyByConversation",
  ] as const)("%s returns partial results by default and rejects when completeness is required", async (method) => {
    const client = makeConversationReadClient([
      {
        id: "10",
        createdAt: new Date("2026-06-01T00:00:00Z"),
      } as ReadMessage,
    ])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shardA, shardB]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      withShardClientForRead: vi.fn(
        (shard: { id: string }, fn: (value: unknown) => Promise<unknown>) => {
          if (shard.id === "b") {
            throw new Error("shard unavailable")
          }
          return fn(client)
        },
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)
    const call = (requireCompleteResults?: boolean) =>
      method === "findLastByConversation"
        ? repo.findLastByConversation("conv-1", {
            limit: 10,
            requireCompleteResults,
            sinceTime,
            workspaceId: "ws-1",
          })
        : repo.findManyByConversation("conv-1", {
            limit: 10,
            requireCompleteResults,
            sinceTime,
            workspaceId: "ws-1",
          })

    await expect(call()).resolves.toHaveLength(1)
    await expect(call(true)).rejects.toBeInstanceOf(
      MessageShardUnavailableError,
    )
  })
})

function makeAIContextReadClient(results: ReadMessage[][]) {
  const select = vi.fn(() => {
    const rows = results.shift() ?? []
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    }
  })
  return { select }
}

describe("ShardedMessageRepository.findAIContextMessages", () => {
  const sinceTime = new Date("2026-01-01T00:00:00Z")
  const shard = makeShardInfo("tr:s1", "s1")
  const marker = {
    id: "8",
    conversationId: "conv-1",
    workspaceId: "ws-1",
    createdAt: new Date("2026-05-30T00:00:00Z"),
    text: "marker",
  }
  const newer = [
    {
      ...marker,
      id: "10",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      text: "newest",
    },
    {
      ...marker,
      id: "9",
      createdAt: new Date("2026-05-31T00:00:00Z"),
      text: "new",
    },
  ]
  const options = {
    conversationId: "conv-1",
    workspaceId: "ws-1",
    markerMessageId: marker.id,
    limit: 100,
    sinceTime,
  }

  function makeRepo(client: { select: ReturnType<typeof vi.fn> }) {
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(shard),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (value: unknown) => Promise<unknown>) =>
          fn(client),
      ),
    }
    return new ShardedMessageRepository(shardManager as never)
  }

  test("finds the marker before limiting messages and returns chronological history", async () => {
    const client = makeAIContextReadClient([[marker], newer])
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(shard),
      withShardClientForRead: vi.fn(
        (_shard: unknown, fn: (value: unknown) => Promise<unknown>) =>
          fn(client),
      ),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    const result = await repo.findAIContextMessages(options)

    expect(result.map((message) => message.id)).toEqual(["9", "10"])
    expect(shardManager.getShardsForTimeRange).toHaveBeenCalledWith(
      sinceTime,
      expect.any(Date),
    )
  })

  test("returns empty history when the marker is latest", async () => {
    const repo = makeRepo(makeAIContextReadClient([[marker], []]))

    await expect(repo.findAIContextMessages(options)).resolves.toEqual([])
  })

  test("falls back to latest history when the marker is outside the shard window", async () => {
    const repo = makeRepo(makeAIContextReadClient([[], newer]))

    const result = await repo.findAIContextMessages(options)

    expect(result.map((message) => message.id)).toEqual(["9", "10"])
  })

  test("wraps shard failures and never returns partial AI history", async () => {
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([shard]),
      getWriteShardInfo: vi.fn().mockResolvedValue(shard),
      withShardClientForRead: vi.fn().mockRejectedValue(new Error("down")),
    }
    const repo = new ShardedMessageRepository(shardManager as never)

    await expect(repo.findAIContextMessages(options)).rejects.toBeInstanceOf(
      MessageShardUnavailableError,
    )
  })
})

// ---------------------------------------------------------------------------
// createOrUpdate / createOrUpdateWithAttachments — idempotent echo save
//
// Regression: the Messenger echo webhook (and its retries) delivers the same
// outgoing message twice. The dedup unique index Message_source_dedup_idx
// (contactInboxId, sourceId, createdAt) made the second bare INSERT throw
// ("Failed query: insert into Message ..."). The create-or-update paths now use
// ON CONFLICT DO NOTHING and re-fetch the existing row instead of throwing.
// ---------------------------------------------------------------------------

const passthroughLock = {
  runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn(),
}

const existingRow = {
  id: "existing-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  workspaceId: "ws-1",
  sourceId: "src-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

function makeInsertShardDb(
  returningRows: unknown[],
  writeShardRows: unknown[] = [],
) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningRows),
  }
  const insert = vi.fn().mockReturnValue(chain)
  // findOnWriteShardBySource: db.select().from().where().limit()
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(writeShardRows),
  }
  const select = vi.fn().mockReturnValue(selectChain)
  return { insert, chain, select, selectChain }
}

describe("ShardedMessageRepository.createOrUpdate — idempotent echo save", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("inserts a new message and returns isNew=true", async () => {
    const insertedRow = { ...existingRow, id: "new-1" }
    const shardDb = makeInsertShardDb([insertedRow])
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    vi.spyOn(repo, "findBySourceId").mockResolvedValue(null)

    const result = await repo.createOrUpdate(makeMessage())

    expect(result.isNew).toBe(true)
    expect(result.message).toEqual(insertedRow)
    expect(shardDb.chain.onConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  test("duplicate echo (insert conflict) returns the existing row, isNew=false, without throwing", async () => {
    const shardDb = makeInsertShardDb([]) // ON CONFLICT DO NOTHING → no row back
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    const findSpy = vi
      .spyOn(repo, "findBySourceId")
      .mockResolvedValueOnce(null) // guard read misses (replica lag)
      .mockResolvedValueOnce(existingRow as never) // re-fetch after conflict finds it

    const result = await repo.createOrUpdate(makeMessage())

    expect(result.isNew).toBe(false)
    expect(result.message).toEqual(existingRow)
    expect(shardDb.insert).toHaveBeenCalledTimes(1)
    expect(findSpy).toHaveBeenCalledTimes(2)
  })

  test("conflict where the replica lags is resolved from the write shard (primary)", async () => {
    // insert conflict → replica read (findBySourceId) misses → primary read wins.
    const shardDb = makeInsertShardDb([], [existingRow])
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    vi.spyOn(repo, "findBySourceId").mockResolvedValue(null) // replica lags

    const result = await repo.createOrUpdate(makeMessage())

    expect(result.isNew).toBe(false)
    expect(result.message).toEqual(existingRow) // real row, not fabricated
    expect(shardDb.select).toHaveBeenCalledTimes(1)
  })

  test("conflict unreadable even on the write shard logs info and returns isNew=false without throwing", async () => {
    const shardDb = makeInsertShardDb([], []) // both replica and primary miss
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    vi.spyOn(repo, "findBySourceId").mockResolvedValue(null)

    const result = await repo.createOrUpdate(makeMessage())

    expect(result.isNew).toBe(false)
    // Last-resort best-effort input content (id from makeMessage) — never throws.
    expect(result.message.id).toBe("msg-1")
  })

  // Regression: an Instagram outbound message is saved first (Send API returns
  // the mid → stored as sourceId), then Instagram echoes that same message back
  // ~1.4s later with is_echo:true and NO metadata. The echo must be deduped
  // against the already-saved row. It was not, because the guard read passed
  // sinceTime === echo.createdAt, and findBySourceId's gte(createdAt, sinceTime)
  // filter then excluded the earlier row → a duplicate row was inserted.
  test("dedup guard read looks back past the message's own createdAt so an echo of a just-sent message is caught", async () => {
    const sentAt = new Date("2026-08-04T08:19:29.777Z") // Row A: bot's outbound
    const echoAt = new Date("2026-08-04T08:19:31.191Z") // Row B: echo, ~1.4s later
    const priorRow = { ...existingRow, sourceId: "mid-2", createdAt: sentAt }

    const shardDb = makeInsertShardDb([{ ...priorRow, id: "must-not-insert" }])
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    // Faithfully model findBySourceId's gte(createdAt, sinceTime): the earlier
    // row is visible only when the guard read looks back to at or before sentAt.
    vi.spyOn(repo, "findBySourceId").mockImplementation((async (
      _sourceId: string,
      _conversationId: string,
      _workspaceId: string,
      sinceTime?: Date,
    ) =>
      sinceTime && sinceTime.getTime() <= sentAt.getTime()
        ? priorRow
        : null) as never)

    const echo = makeMessage({
      id: "echo-1",
      sourceId: "mid-2",
      messageType: "outgoing",
      createdAt: echoAt,
    })
    const result = await repo.createOrUpdate(echo)

    expect(result.isNew).toBe(false)
    expect(result.message).toEqual(priorRow)
    expect(shardDb.insert).not.toHaveBeenCalled()
  })
})

describe("ShardedMessageRepository.createOrUpdateWithAttachments — idempotent echo save", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("duplicate echo with attachments returns existing row, isNew=false, without throwing", async () => {
    const txChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]), // conflict → no row
    }
    const tx = { insert: vi.fn().mockReturnValue(txChain) }
    const shardDb = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) =>
        fn(tx),
      ),
    }
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    const existingWithAttachments = { ...existingRow, attachments: [] }
    vi.spyOn(repo, "findBySourceId")
      .mockResolvedValueOnce(null) // guard read misses
      .mockResolvedValueOnce(existingRow as never) // re-fetch finds it
    vi.spyOn(repo, "findById").mockResolvedValue(
      existingWithAttachments as never,
    )

    const result = await repo.createOrUpdateWithAttachments(makeMessage(), [])

    expect(result.isNew).toBe(false)
    expect(result.result).toEqual(existingWithAttachments)
    expect(txChain.onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(shardDb.transaction).toHaveBeenCalledTimes(1)
  })

  // Same send→echo regression as createOrUpdate, on the attachments path: the
  // guard read must look back far enough to see the message saved seconds ago,
  // otherwise the echo is inserted a second time.
  test("dedup guard read looks back past the message's own createdAt so an echo of a just-sent message is caught", async () => {
    const sentAt = new Date("2026-08-04T08:19:29.777Z")
    const echoAt = new Date("2026-08-04T08:19:31.191Z")
    const priorRow = { ...existingRow, sourceId: "mid-2", createdAt: sentAt }

    const txChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi
        .fn()
        .mockResolvedValue([{ ...priorRow, id: "must-not-insert" }]),
    }
    const tx = { insert: vi.fn().mockReturnValue(txChain) }
    const shardDb = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) =>
        fn(tx),
      ),
    }
    const shardManager = {
      getShardForWrite: vi.fn().mockResolvedValue(shardDb),
    }
    const repo = new ShardedMessageRepository(
      shardManager as never,
      passthroughLock as never,
    )
    vi.spyOn(repo, "findBySourceId").mockImplementation((async (
      _sourceId: string,
      _conversationId: string,
      _workspaceId: string,
      sinceTime?: Date,
    ) =>
      sinceTime && sinceTime.getTime() <= sentAt.getTime()
        ? priorRow
        : null) as never)
    vi.spyOn(repo, "findById").mockResolvedValue({
      ...priorRow,
      attachments: [],
    } as never)

    const echo = makeMessage({
      id: "echo-1",
      sourceId: "mid-2",
      messageType: "outgoing",
      createdAt: echoAt,
    })
    const result = await repo.createOrUpdateWithAttachments(echo, [])

    expect(result.isNew).toBe(false)
    expect(shardDb.transaction).not.toHaveBeenCalled()
  })
})
