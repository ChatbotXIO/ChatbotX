import { beforeEach, describe, expect, test, vi } from "vitest"
import type {
  BulkCreateAttachmentInput,
  CreateMessageInput,
} from "../src/repositories/message/message-repository"
import { MessageRepository } from "../src/repositories/message/message-repository"
import { attachmentModel, messageModel } from "../src/schema"

// ---------------------------------------------------------------------------
// Inline mock DatabaseClient — MessageRepository takes client in constructor
// ---------------------------------------------------------------------------

function makeDbMock() {
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

describe("MessageRepository.bulkCreate", () => {
  let repo: MessageRepository
  let insert: ReturnType<typeof vi.fn>
  let chain: ReturnType<typeof makeDbMock>["chain"]
  let update: ReturnType<typeof vi.fn>
  let updateChain: ReturnType<typeof makeDbMock>["updateChain"]

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = makeDbMock()
    insert = mock.insert
    chain = mock.chain
    update = mock.update
    updateChain = mock.updateChain
    repo = new MessageRepository({ insert, update } as never)
  })

  test("inserts messages and returns { id, sourceId }[]", async () => {
    chain.returning.mockResolvedValue([{ id: "msg-1", sourceId: "src-1" }])

    const result = await repo.bulkCreate([makeMessage()])

    expect(result).toEqual([{ id: "msg-1", sourceId: "src-1" }])
    expect(insert).toHaveBeenCalledTimes(1)
  })

  test("conflict target is (contactInboxId, sourceId) — no createdAt for main table", async () => {
    chain.returning.mockResolvedValue([])

    await repo.bulkCreate([makeMessage()])

    const [callArg] = chain.onConflictDoNothing.mock.calls[0]
    expect(callArg.target).toHaveLength(2)
    expect(callArg.target).toContain(messageModel.contactInboxId)
    expect(callArg.target).toContain(messageModel.sourceId)
    expect(callArg.target).not.toContain(messageModel.createdAt)
  })

  test("returns empty array when no messages provided", async () => {
    const result = await repo.bulkCreate([])

    expect(result).toEqual([])
    expect(insert).not.toHaveBeenCalled()
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
    // Use 2001 messages to force 3 chunks; each chunk returns some inserted rows
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

  test("updateSourceId calls db.update on messageModel with correct id and sourceId", async () => {
    await repo.updateSourceId("msg-1", "prov-abc", "ws-1")

    expect(update).toHaveBeenCalledWith(messageModel)
    expect(updateChain.set).toHaveBeenCalledWith({ sourceId: "prov-abc" })
    expect(updateChain.where).toHaveBeenCalled()
  })

  test("bulkCreateAttachments inserts into main attachmentModel and returns { id }[]", async () => {
    chain.returning.mockResolvedValue([{ id: "att-1" }])

    const input: BulkCreateAttachmentInput = {
      id: "att-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      messageCreatedAt: new Date("2026-01-01"),
      fileType: "image",
      mimeType: "image/png",
      originPath: "/uploads/img.png",
    }

    const result = await repo.bulkCreateAttachments([input])

    expect(result).toEqual([{ id: "att-1" }])
    expect(insert).toHaveBeenCalledWith(attachmentModel)
    const insertedValues: Record<string, unknown>[] =
      chain.values.mock.calls[0][0]
    expect(insertedValues[0].messageId).toBe("msg-1")
    expect(insertedValues[0].workspaceId).toBe("ws-1")
    expect("messageCreatedAt" in insertedValues[0]).toBe(false)
  })

  test("bulkCreateAttachments returns empty array for empty input without calling insert", async () => {
    const result = await repo.bulkCreateAttachments([])

    expect(result).toEqual([])
    // insert call count must remain 0 — no DB roundtrip
    expect(insert).toHaveBeenCalledTimes(0)
  })
})

describe("MessageRepository direct message/attachment lookup helpers", () => {
  test("findManyBySourceIds returns empty without querying when ids are missing", async () => {
    const select = vi.fn()
    const repo = new MessageRepository({ select } as never)

    await expect(
      repo.findManyBySourceIds({
        contactInboxIds: [],
        sourceIds: ["src-1"],
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual([])
    await expect(
      repo.findManyBySourceIds({
        contactInboxIds: ["ci-1"],
        sourceIds: [],
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual([])

    expect(select).not.toHaveBeenCalled()
  })

  test("findManyBySourceIds projects createdAt and filters by workspace, contact inbox, source, and sinceTime", async () => {
    const rows = [
      {
        id: "msg-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        sourceId: "src-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    }
    const select = vi.fn().mockReturnValue(chain)
    const repo = new MessageRepository({ select } as never)
    const sinceTime = new Date("2025-12-01T00:00:00Z")

    const result = await repo.findManyBySourceIds({
      contactInboxIds: ["ci-1"],
      sourceIds: ["src-1"],
      workspaceId: "ws-1",
      sinceTime,
    })

    expect(result).toEqual(rows)
    expect(Object.keys(select.mock.calls[0][0])).toEqual([
      "id",
      "conversationId",
      "contactInboxId",
      "sourceId",
      "createdAt",
    ])
    expect(chain.from).toHaveBeenCalledWith(messageModel)
    const whereValues = collectSqlValues(chain.where.mock.calls[0])
    expect(whereValues).toEqual(
      expect.arrayContaining(["ws-1", "ci-1", "src-1"]),
    )
  })

  test("bulkPatchContentAttributes updates every patch inside one transaction", async () => {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }
    const tx = {
      update: vi.fn().mockReturnValue(updateChain),
    }
    const transaction = vi.fn(async (fn: (value: unknown) => Promise<void>) =>
      fn(tx),
    )
    const repo = new MessageRepository({ transaction } as never)

    await repo.bulkPatchContentAttributes({
      workspaceId: "ws-1",
      sinceTime: new Date("2026-01-01T00:00:00Z"),
      patches: [
        {
          contactInboxId: "ci-1",
          sourceId: "src-1",
          overlay: { edited: true },
          text: "",
        },
        {
          contactInboxId: "ci-2",
          sourceId: "src-2",
          overlay: { revoked: true },
        },
      ],
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(tx.update).toHaveBeenCalledTimes(2)
    expect(tx.update).toHaveBeenCalledWith(messageModel)
    expect(updateChain.set.mock.calls[0][0]).toMatchObject({ text: "" })
    expect(updateChain.set.mock.calls[1][0]).not.toHaveProperty("text")
    expect(updateChain.where).toHaveBeenCalledTimes(2)
  })

  test("bulkPatchContentAttributes skips empty patch batches", async () => {
    const transaction = vi.fn()
    const repo = new MessageRepository({ transaction } as never)

    await repo.bulkPatchContentAttributes({
      workspaceId: "ws-1",
      sinceTime: new Date("2026-01-01T00:00:00Z"),
      patches: [],
    })

    expect(transaction).not.toHaveBeenCalled()
  })

  test("findAttachmentById returns the attachment with createdAt and tenant filter", async () => {
    const row = {
      id: "att-1",
      originPath: "wa-media:123",
      mimeType: "image/png",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([row]),
    }
    const select = vi.fn().mockReturnValue(chain)
    const repo = new MessageRepository({ select } as never)

    const result = await repo.findAttachmentById({
      id: "att-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(row)
    expect(Object.keys(select.mock.calls[0][0])).toEqual([
      "id",
      "originPath",
      "mimeType",
      "createdAt",
    ])
    expect(chain.from).toHaveBeenCalledWith(attachmentModel)
    expect(chain.limit).toHaveBeenCalledWith(1)
  })

  test("updateAttachment preserves zero dimensions and filters by id plus createdAt", async () => {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }
    const update = vi.fn().mockReturnValue(updateChain)
    const repo = new MessageRepository({ update } as never)
    const createdAt = new Date("2026-01-01T00:00:00Z")

    await repo.updateAttachment({
      id: "att-1",
      workspaceId: "ws-1",
      createdAt,
      fields: {
        originPath: "workspace/a/att-1.png",
        mimeType: "image/png",
        size: 0,
        width: 0,
        height: 0,
      },
    })

    expect(update).toHaveBeenCalledWith(attachmentModel)
    expect(updateChain.set.mock.calls[0][0]).toMatchObject({
      originPath: "workspace/a/att-1.png",
      mimeType: "image/png",
      size: 0,
      width: 0,
      height: 0,
    })
    expect(updateChain.where).toHaveBeenCalled()
  })
})

describe("MessageRepository conversation ordering", () => {
  test.each([
    "findLastByConversation",
    "findManyByConversation",
  ] as const)("%s orders equal timestamps by descending id", async (method) => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    const repo = new MessageRepository({
      select: vi.fn().mockReturnValue(chain),
    } as never)

    if (method === "findLastByConversation") {
      await repo.findLastByConversation("conv-1")
    } else {
      await repo.findManyByConversation("conv-1", { limit: 10 })
    }

    expect(chain.orderBy).toHaveBeenCalledTimes(1)
    expect(chain.orderBy.mock.calls[0]).toHaveLength(2)
  })
})

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
}

function collectSqlValues(
  node: unknown,
  seen = new WeakSet<object>(),
  out: unknown[] = [],
): unknown[] {
  if (!node || typeof node !== "object" || seen.has(node)) {
    return out
  }
  seen.add(node)
  if (Array.isArray(node)) {
    for (const item of node) {
      collectSqlValues(item, seen, out)
    }
    return out
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "value" &&
      (typeof value === "string" || typeof value === "number")
    ) {
      out.push(value)
    } else {
      collectSqlValues(value, seen, out)
    }
  }
  return out
}

describe("MessageRepository.findAIContextMessages", () => {
  const latest = [
    { id: "10", createdAt: new Date("2026-06-01T00:00:00Z") },
    { id: "9", createdAt: new Date("2026-05-31T00:00:00Z") },
  ]
  const options = {
    conversationId: "conv-1",
    workspaceId: "ws-1",
    markerMessageId: "8",
    limit: 100,
    sinceTime: new Date("2026-01-01T00:00:00Z"),
  }

  test("returns latest messages in chronological order without a marker", async () => {
    const select = vi.fn().mockReturnValue(makeSelectChain(latest))
    const repo = new MessageRepository({ select } as never)

    const result = await repo.findAIContextMessages({
      ...options,
      markerMessageId: null,
    })

    expect(result.map((message) => message.id)).toEqual(["9", "10"])
  })

  test("applies message filters before limiting context history", async () => {
    const chain = makeSelectChain(latest)
    const repo = new MessageRepository({
      select: vi.fn().mockReturnValue(chain),
    } as never)

    await repo.findAIContextMessages({
      ...options,
      markerMessageId: null,
      messageTypes: ["incoming", "outgoing"],
      textNotNull: true,
    })

    const whereValues = collectSqlValues(chain.where.mock.calls[0])
    expect(whereValues).toContain("incoming")
    expect(whereValues).toContain("outgoing")
  })

  test("returns only messages after an existing marker", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "8", createdAt: new Date("2026-05-30T00:00:00Z") },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain(latest))
    const repo = new MessageRepository({ select } as never)

    const result = await repo.findAIContextMessages(options)

    expect(result.map((message) => message.id)).toEqual(["9", "10"])
    expect(select).toHaveBeenCalledTimes(2)
  })

  test("falls back to latest history when marker is missing", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain(latest))
    const repo = new MessageRepository({ select } as never)

    const result = await repo.findAIContextMessages(options)

    expect(result.map((message) => message.id)).toEqual(["9", "10"])
  })

  test("returns empty history when marker is latest", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "10", createdAt: new Date("2026-06-01T00:00:00Z") },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([]))
    const repo = new MessageRepository({ select } as never)

    const result = await repo.findAIContextMessages(options)

    expect(result).toEqual([])
  })
})
