import { beforeEach, describe, expect, test, vi } from "vitest"

// Controls what transitionOnce's .returning() yields
const transitionResult: {
  current: {
    contactId?: string | null
    occurredAt?: Date | null
    topicId: string | null
    topicReferenceId?: string | null
    workspaceId: string
  }[]
} = { current: [] }

// Tracks which model was passed to db.update() / tx.update() on each call
const updateModelArgs: unknown[] = []

// Tracks payload passed to builder.values() (insert data)
const capturedInsertValues: unknown[] = []

const UUID_REGEX =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

vi.mock("@chatbotx.io/database/client", () => {
  const builder: Record<string, unknown> = {}
  builder.set = vi.fn(() => builder)
  builder.where = vi.fn(() => builder)
  builder.returning = vi.fn(async () => transitionResult.current)
  builder.values = vi.fn((payload: unknown) => {
    capturedInsertValues.push(payload)
  })

  const makeTx = () => ({
    insert: vi.fn(() => builder),
    update: vi.fn((model: unknown) => {
      updateModelArgs.push(model)
      return builder
    }),
  })

  return {
    db: {
      update: vi.fn((model: unknown) => {
        updateModelArgs.push(model)
        return builder
      }),
      insert: vi.fn(() => builder),
      transaction: vi.fn(
        async (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) =>
          await fn(makeTx()),
      ),
    },
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    isNull: (...args: unknown[]) => args,
    sql: Object.assign((...args: unknown[]) => ({ sql: args }), {
      raw: (s: string) => s,
    }),
  }
})

const analyticsEmailTopicModelMock = {
  token: "token_col",
  firstSeenAt: "firstSeenAt_col",
  firstClickedAt: "firstClickedAt_col",
  deliveredAt: "deliveredAt_col",
  seenCount: "seenCount_col",
  clickCount: "clickCount_col",
  lastSeenAt: "lastSeenAt_col",
  lastClickedAt: "lastClickedAt_col",
  topicId: "topicId_col",
  topicReferenceId: "topicReferenceId_col",
  contactId: "contactId_col",
  workspaceId: "workspaceId_col",
}

const emailTopicModelMock = {
  id: "id_col",
  workspaceId: "workspaceId_col",
  seensTotal: "seensTotal_col",
  clicksTotal: "clicksTotal_col",
  sendsTotal: "sendsTotal_col",
  deliveredsTotal: "deliveredsTotal_col",
}

vi.mock("@chatbotx.io/database/schema", () => ({
  analyticsEmailTopicModel: analyticsEmailTopicModelMock,
  emailTopicModel: emailTopicModelMock,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "snowflake-id"),
  }
})

const { db } = await import("@chatbotx.io/database/client")
const { emailTopicStatsRepository } = await import(
  "../src/repositories/postgres/email-topic-stats.repository"
)

beforeEach(() => {
  transitionResult.current = []
  updateModelArgs.length = 0
  capturedInsertValues.length = 0
  vi.clearAllMocks()
})

describe("recordOpen", () => {
  test("always runs countRaw update on recipient", async () => {
    await emailTopicStatsRepository.recordOpen("tok")
    expect(db.update).toHaveBeenCalledWith(analyticsEmailTopicModelMock)
  })

  test("first open: owes a seensTotal bump but leaves the topic row untouched", async () => {
    transitionResult.current = [{ topicId: "t1", workspaceId: "w1" }]
    const transition = await emailTopicStatsRepository.recordOpen("tok")
    // countRaw(recipient) + transitionOnce(recipient); the topic row is locked
    // last, by the caller, via incrementTopicCounter.
    expect(db.update).toHaveBeenCalledTimes(2)
    expect(updateModelArgs).not.toContain(emailTopicModelMock)
    expect(transition?.counterIncrement).toEqual({
      counter: "seensTotal",
      topicId: "t1",
      workspaceId: "w1",
    })
  })

  test("repeat open: no EmailTopic bump", async () => {
    transitionResult.current = []
    await emailTopicStatsRepository.recordOpen("tok")
    // countRaw(recipient) + transitionOnce(recipient) — no incrementCounter
    expect(db.update).toHaveBeenCalledTimes(2)
    expect(
      updateModelArgs.every((m) => m === analyticsEmailTopicModelMock),
    ).toBe(true)
  })
})

describe("recordClick", () => {
  test("always runs countRaw update on recipient", async () => {
    await emailTopicStatsRepository.recordClick("tok")
    expect(db.update).toHaveBeenCalledWith(analyticsEmailTopicModelMock)
  })

  test("first click: owes a clicksTotal bump but leaves the topic row untouched", async () => {
    transitionResult.current = [{ topicId: "t1", workspaceId: "w1" }]
    const transition = await emailTopicStatsRepository.recordClick("tok")
    expect(transition?.counterIncrement?.counter).toBe("clicksTotal")
    expect(updateModelArgs).not.toContain(emailTopicModelMock)
    expect(db.update).toHaveBeenCalledTimes(2)
  })

  test("repeat click: no EmailTopic bump", async () => {
    transitionResult.current = []
    await emailTopicStatsRepository.recordClick("tok")
    expect(db.update).toHaveBeenCalledTimes(2)
    expect(
      updateModelArgs.every((m) => m === analyticsEmailTopicModelMock),
    ).toBe(true)
  })
})

describe("markDelivered", () => {
  test("first delivery: owes a deliveredsTotal bump but leaves the topic row untouched", async () => {
    transitionResult.current = [{ topicId: "t1", workspaceId: "w1" }]
    const transition = await emailTopicStatsRepository.markDelivered("tok")
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(updateModelArgs).not.toContain(emailTopicModelMock)
    expect(transition?.counterIncrement?.counter).toBe("deliveredsTotal")
  })

  test("already delivered (returning []): no EmailTopic bump", async () => {
    transitionResult.current = []
    await emailTopicStatsRepository.markDelivered("tok")
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(updateModelArgs[0]).toBe(analyticsEmailTopicModelMock)
  })
})

describe("markFailed", () => {
  test("sets failedAt, no EmailTopic counter bump", async () => {
    await emailTopicStatsRepository.markFailed("tok")
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(updateModelArgs[0]).toBe(analyticsEmailTopicModelMock)
  })
})

describe("createRecipient", () => {
  test("returns a random UUID token", async () => {
    const { token } = await emailTopicStatsRepository.createRecipient({
      topicId: "t1",
      workspaceId: "w1",
      email: "a@b.com",
    })
    expect(token).toMatch(UUID_REGEX)
  })

  test("runs in a transaction and inserts row with correct fields", async () => {
    await emailTopicStatsRepository.createRecipient({
      topicId: "t1",
      workspaceId: "w1",
      email: "a@b.com",
      contactId: "c1",
    })
    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(capturedInsertValues[0]).toMatchObject({
      topicId: "t1",
      workspaceId: "w1",
      email: "a@b.com",
      contactId: "c1",
    })
    expect((capturedInsertValues[0] as { token: string }).token).toMatch(
      UUID_REGEX,
    )
  })

  test("owes a sendsTotal bump without touching the topic row itself", async () => {
    const created = await emailTopicStatsRepository.createRecipient({
      topicId: "t1",
      workspaceId: "w1",
      email: "a@b.com",
    })
    expect(updateModelArgs).not.toContain(emailTopicModelMock)
    expect(created.counterIncrement).toEqual({
      counter: "sendsTotal",
      topicId: "t1",
      workspaceId: "w1",
    })
  })
})

describe("incrementTopicCounter", () => {
  test("bumps the owed counter on the EmailTopic row", async () => {
    await emailTopicStatsRepository.incrementTopicCounter({
      counter: "seensTotal",
      topicId: "t1",
      workspaceId: "w1",
    })
    expect(updateModelArgs).toEqual([emailTopicModelMock])
  })

  test("runs on the caller's transaction handle", async () => {
    const txUpdate = vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.set = vi.fn(() => builder)
      builder.where = vi.fn(() => builder)
      return builder
    })

    await emailTopicStatsRepository.incrementTopicCounter(
      { counter: "clicksTotal", topicId: "t1", workspaceId: "w1" },
      { update: txUpdate } as never,
    )

    expect(txUpdate).toHaveBeenCalledWith(emailTopicModelMock)
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe("transitions report the first occurrence for contact activity", () => {
  const occurredAt = new Date("2026-01-01T00:00:00Z")

  test("returns the contact, time and snapshot topic on the first transition", async () => {
    transitionResult.current = [
      {
        contactId: "c1",
        occurredAt,
        topicId: "t1",
        topicReferenceId: "t1",
        workspaceId: "w1",
      },
    ]

    expect(await emailTopicStatsRepository.recordOpen("tok")).toEqual({
      contactId: "c1",
      counterIncrement: {
        counter: "seensTotal",
        topicId: "t1",
        workspaceId: "w1",
      },
      occurredAt,
      topicReferenceId: "t1",
      workspaceId: "w1",
    })
  })

  test("returns null for a repeat so no activity is written twice", async () => {
    transitionResult.current = []

    expect(await emailTopicStatsRepository.recordClick("tok")).toBeNull()
    expect(await emailTopicStatsRepository.markDelivered("tok")).toBeNull()
  })

  test("keeps the original topic after the topic was deleted and skips the counter", async () => {
    transitionResult.current = [
      {
        contactId: "c1",
        occurredAt,
        topicId: null,
        topicReferenceId: "t-deleted",
        workspaceId: "w1",
      },
    ]

    const transition = await emailTopicStatsRepository.markDelivered("tok")

    expect(transition?.topicReferenceId).toBe("t-deleted")
    // Nothing is owed: there is no topic row left to count on.
    expect(transition?.counterIncrement).toBeNull()
  })

  test("falls back to the live topic id for a row created before the snapshot column", async () => {
    transitionResult.current = [
      {
        contactId: "c1",
        occurredAt,
        topicId: "t1",
        topicReferenceId: null,
        workspaceId: "w1",
      },
    ]

    expect(
      (await emailTopicStatsRepository.markDelivered("tok"))?.topicReferenceId,
    ).toBe("t1")
  })

  test("reports no topic for an email sent without one", async () => {
    transitionResult.current = [
      {
        contactId: "c1",
        occurredAt,
        topicId: null,
        topicReferenceId: null,
        workspaceId: "w1",
      },
    ]

    expect(
      (await emailTopicStatsRepository.recordOpen("tok"))?.topicReferenceId,
    ).toBeNull()
  })

  test("uses the caller's transaction handle for every statement", async () => {
    transitionResult.current = [
      { contactId: "c1", occurredAt, topicId: "t1", workspaceId: "w1" },
    ]
    const txUpdate = vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.set = vi.fn(() => builder)
      builder.where = vi.fn(() => builder)
      builder.returning = vi.fn(async () => transitionResult.current)
      return builder
    })

    await emailTopicStatsRepository.recordOpen("tok", {
      update: txUpdate,
    } as never)

    expect(txUpdate).toHaveBeenCalledTimes(2)
    expect(db.update).not.toHaveBeenCalled()
  })
})

describe("createRecipient without a topic", () => {
  test("writes the recipient row but moves no topic counter", async () => {
    const created = await emailTopicStatsRepository.createRecipient({
      workspaceId: "w1",
      email: "a@b.com",
      contactId: "c1",
    })

    expect(capturedInsertValues[0]).toMatchObject({
      topicId: null,
      topicReferenceId: null,
      workspaceId: "w1",
    })
    expect(updateModelArgs).not.toContain(emailTopicModelMock)
    expect(created).toMatchObject({
      contactId: "c1",
      topicReferenceId: null,
      workspaceId: "w1",
    })
  })

  test("snapshots the topic id for an email with a topic", async () => {
    const created = await emailTopicStatsRepository.createRecipient({
      topicId: "t1",
      workspaceId: "w1",
      email: "a@b.com",
    })

    expect(capturedInsertValues[0]).toMatchObject({
      topicId: "t1",
      topicReferenceId: "t1",
    })
    expect(created.topicReferenceId).toBe("t1")
  })

  test("joins the caller's transaction instead of opening one", async () => {
    const insert = vi.fn(() => ({
      values: vi.fn((payload: unknown) => {
        capturedInsertValues.push(payload)
      }),
    }))

    await emailTopicStatsRepository.createRecipient(
      { workspaceId: "w1", email: "a@b.com" },
      { insert, update: vi.fn() } as never,
    )

    expect(db.transaction).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
