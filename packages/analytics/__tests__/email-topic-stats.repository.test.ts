import { beforeEach, describe, expect, test, vi } from "vitest"

// Controls what transitionOnce's .returning() yields
const transitionResult: {
  current: { topicId: string; workspaceId: string }[]
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

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "snowflake-id"),
}))

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

  test("first open: bumps seensTotal on EmailTopic", async () => {
    transitionResult.current = [{ topicId: "t1", workspaceId: "w1" }]
    await emailTopicStatsRepository.recordOpen("tok")
    // countRaw(recipient) + transitionOnce(recipient) + incrementCounter(topic)
    expect(db.update).toHaveBeenCalledTimes(3)
    expect(updateModelArgs[2]).toBe(emailTopicModelMock)
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

  test("first click: bumps clicksTotal on EmailTopic", async () => {
    transitionResult.current = [{ topicId: "t1", workspaceId: "w1" }]
    await emailTopicStatsRepository.recordClick("tok")
    expect(db.update).toHaveBeenCalledTimes(3)
    expect(updateModelArgs[2]).toBe(emailTopicModelMock)
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
  test("first delivery: bumps deliveredsTotal on EmailTopic", async () => {
    transitionResult.current = [{ topicId: "t1", workspaceId: "w1" }]
    await emailTopicStatsRepository.markDelivered("tok")
    // transitionOnce(recipient) + incrementCounter(topic)
    expect(db.update).toHaveBeenCalledTimes(2)
    expect(updateModelArgs[1]).toBe(emailTopicModelMock)
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

  test("bumps sendsTotal inside the transaction", async () => {
    await emailTopicStatsRepository.createRecipient({
      topicId: "t1",
      workspaceId: "w1",
      email: "a@b.com",
    })
    expect(updateModelArgs).toContain(emailTopicModelMock)
  })
})
