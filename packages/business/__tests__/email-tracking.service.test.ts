import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createRecipient: vi.fn(),
  incrementTopicCounter: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
  loggerError: vi.fn(),
  markDelivered: vi.fn(),
  record: vi.fn(),
  recordClick: vi.fn(),
  recordOpen: vi.fn(),
  tx: { tag: "tx" },
}))

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: {
    createRecipient: mocks.createRecipient,
    incrementTopicCounter: mocks.incrementTopicCounter,
    markDelivered: mocks.markDelivered,
    recordClick: mocks.recordClick,
    recordOpen: mocks.recordOpen,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(mocks.tx),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    recordEmailTrackingTransition: "recordEmailTrackingTransition",
  },
  enqueueIntegrationJob: mocks.enqueueIntegrationJob,
}))

vi.mock("../src/logger", () => ({ logger: { error: mocks.loggerError } }))

vi.mock("../src/contact-activity/service", () => ({
  contactActivityService: { record: mocks.record },
}))

const { emailTrackingService, emailTrackingTransitionJobId } = await import(
  "../src/email-topic/tracking-service"
)

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z")
const increment = {
  counter: "seensTotal",
  topicId: "t1",
  workspaceId: "w1",
}
const transition = (overrides: Record<string, unknown> = {}) => ({
  contactId: "c1",
  counterIncrement: increment,
  occurredAt: OCCURRED_AT,
  topicReferenceId: "t1",
  workspaceId: "w1",
  ...overrides,
})

describe("emailTrackingService.createRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRecipient.mockResolvedValue({
      contactId: "c1",
      counterIncrement: { ...increment, counter: "sendsTotal" },
      token: "tok",
      topicReferenceId: "t1",
      workspaceId: "w1",
    })
    mocks.record.mockResolvedValue(true)
    mocks.incrementTopicCounter.mockResolvedValue(undefined)
  })

  test("creates the recipient and records 'sent' in one transaction", async () => {
    const result = await emailTrackingService.createRecipient({
      contactId: "c1",
      email: "a@b.com",
      topicId: "t1",
      workspaceId: "w1",
    })

    expect(result).toEqual({ token: "tok" })
    expect(mocks.createRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: "t1" }),
      mocks.tx,
    )
    expect(mocks.record).toHaveBeenCalledWith({
      entries: [
        expect.objectContaining({
          activityType: "messageSent",
          contactId: "c1",
          referenceId: "t1",
          referenceType: "emailTopic",
        }),
      ],
      tx: mocks.tx,
      workspaceId: "w1",
    })
  })

  test("bumps the topic counter last, after the activity write", async () => {
    const order: string[] = []
    mocks.record.mockImplementation(() => {
      order.push("activity")
      return Promise.resolve(true)
    })
    mocks.incrementTopicCounter.mockImplementation(() => {
      order.push("counter")
      return Promise.resolve()
    })

    await emailTrackingService.createRecipient({
      contactId: "c1",
      email: "a@b.com",
      topicId: "t1",
      workspaceId: "w1",
    })

    expect(order).toEqual(["activity", "counter"])
    expect(mocks.incrementTopicCounter).toHaveBeenCalledWith(
      { ...increment, counter: "sendsTotal" },
      mocks.tx,
    )
  })

  test("moves no topic counter for an email without a topic", async () => {
    mocks.createRecipient.mockResolvedValue({
      contactId: "c1",
      counterIncrement: null,
      token: "tok",
      topicReferenceId: null,
      workspaceId: "w1",
    })

    await emailTrackingService.createRecipient({
      contactId: "c1",
      email: "a@b.com",
      workspaceId: "w1",
    })

    expect(mocks.incrementTopicCounter).not.toHaveBeenCalled()
  })

  test("records 'sent' under no reference for an email without a topic", async () => {
    mocks.createRecipient.mockResolvedValue({
      contactId: "c1",
      token: "tok",
      topicReferenceId: null,
      workspaceId: "w1",
    })

    await emailTrackingService.createRecipient({
      contactId: "c1",
      email: "a@b.com",
      workspaceId: "w1",
    })

    expect(
      mocks.record.mock.calls[0]?.[0].entries[0].referenceId,
    ).toBeUndefined()
  })

  test("writes no activity for a recipient without a contact", async () => {
    mocks.createRecipient.mockResolvedValue({
      contactId: null,
      counterIncrement: null,
      token: "tok",
      topicReferenceId: null,
      workspaceId: "w1",
    })

    await emailTrackingService.createRecipient({
      email: "a@b.com",
      workspaceId: "w1",
    })

    expect(mocks.record).not.toHaveBeenCalled()
  })

  test("fails (rolling the recipient back) when recording fails", async () => {
    mocks.record.mockRejectedValue(new Error("db down"))

    await expect(
      emailTrackingService.createRecipient({
        contactId: "c1",
        email: "a@b.com",
        workspaceId: "w1",
      }),
    ).rejects.toThrow("db down")
  })
})

describe("emailTrackingService.recordTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.record.mockResolvedValue(true)
    mocks.incrementTopicCounter.mockResolvedValue(undefined)
  })

  test("bumps the topic counter as the last statement", async () => {
    const order: string[] = []
    mocks.recordOpen.mockImplementation(() => {
      order.push("transition")
      return Promise.resolve(transition())
    })
    mocks.record.mockImplementation(() => {
      order.push("activity")
      return Promise.resolve(true)
    })
    mocks.incrementTopicCounter.mockImplementation(() => {
      order.push("counter")
      return Promise.resolve()
    })

    await emailTrackingService.recordTransition({
      phase: "opened",
      token: "tok",
    })

    expect(order).toEqual(["transition", "activity", "counter"])
    expect(mocks.incrementTopicCounter).toHaveBeenCalledWith(
      increment,
      mocks.tx,
    )
  })

  test("still bumps the counter when the contact is gone", async () => {
    mocks.recordClick.mockResolvedValue(transition({ contactId: null }))

    await emailTrackingService.recordTransition({
      phase: "clicked",
      token: "tok",
    })

    expect(mocks.record).not.toHaveBeenCalled()
    expect(mocks.incrementTopicCounter).toHaveBeenCalledTimes(1)
  })

  test("does not bump the counter when the activity write fails", async () => {
    mocks.recordOpen.mockResolvedValue(transition())
    mocks.record.mockRejectedValue(new Error("db down"))

    await expect(
      emailTrackingService.recordTransition({ phase: "opened", token: "tok" }),
    ).rejects.toThrow("db down")
    expect(mocks.incrementTopicCounter).not.toHaveBeenCalled()
  })

  test("owes nothing once the topic was deleted", async () => {
    mocks.markDelivered.mockResolvedValue(
      transition({ counterIncrement: null }),
    )

    await emailTrackingService.recordTransition({
      phase: "delivered",
      token: "tok",
    })

    expect(mocks.incrementTopicCounter).not.toHaveBeenCalled()
  })

  test.each([
    ["delivered", "markDelivered", "messageDelivered"],
    ["opened", "recordOpen", "messageOpened"],
    ["clicked", "recordClick", "messageClicked"],
  ] as const)("%s runs %s and records %s", async (phase, method, activityType) => {
    mocks[method].mockResolvedValue(transition())

    await emailTrackingService.recordTransition({ phase, token: "tok" })

    expect(mocks[method]).toHaveBeenCalledWith("tok", mocks.tx)
    expect(mocks.record).toHaveBeenCalledWith({
      entries: [
        {
          activityType,
          contactId: "c1",
          occurredAt: OCCURRED_AT,
          referenceId: "t1",
          referenceType: "emailTopic",
        },
      ],
      tx: mocks.tx,
      workspaceId: "w1",
    })
  })

  test("a repeat transition records no activity", async () => {
    mocks.recordOpen.mockResolvedValue(null)

    await emailTrackingService.recordTransition({
      phase: "opened",
      token: "tok",
    })

    expect(mocks.record).not.toHaveBeenCalled()
  })

  test("keeps the original topic after the topic was deleted", async () => {
    mocks.markDelivered.mockResolvedValue(
      transition({ topicReferenceId: "t-deleted" }),
    )

    await emailTrackingService.recordTransition({
      phase: "delivered",
      token: "tok",
    })

    expect(mocks.record.mock.calls[0]?.[0].entries[0].referenceId).toBe(
      "t-deleted",
    )
  })

  test("a deleted contact only moves the tracking counters", async () => {
    mocks.recordClick.mockResolvedValue(transition({ contactId: null }))

    await emailTrackingService.recordTransition({
      phase: "clicked",
      token: "tok",
    })

    expect(mocks.record).not.toHaveBeenCalled()
  })

  test("surfaces a recording failure so the caller can enqueue the repair", async () => {
    mocks.recordOpen.mockResolvedValue(transition())
    mocks.record.mockRejectedValue(new Error("db down"))

    await expect(
      emailTrackingService.recordTransition({ phase: "opened", token: "tok" }),
    ).rejects.toThrow("db down")
  })
})

describe("emailTrackingService.recordTransitionOrEnqueueRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.record.mockResolvedValue(true)
    mocks.enqueueIntegrationJob.mockResolvedValue(undefined)
  })

  test("does not enqueue a repair when the transition succeeds", async () => {
    mocks.recordOpen.mockResolvedValue(transition())

    await emailTrackingService.recordTransitionOrEnqueueRepair({
      phase: "opened",
      token: "tok",
    })

    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })

  test("enqueues a deduplicated repair and never throws when the transition fails", async () => {
    mocks.markDelivered.mockResolvedValue(transition())
    mocks.record.mockRejectedValue(new Error("db down"))

    await expect(
      emailTrackingService.recordTransitionOrEnqueueRepair({
        phase: "delivered",
        token: "tok",
        workspaceId: "w1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledWith(
      {
        data: { phase: "delivered", token: "tok", workspaceId: "w1" },
        type: "recordEmailTrackingTransition",
      },
      { jobId: emailTrackingTransitionJobId("tok", "delivered") },
    )
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  test("carries the clicked link into the repair job", async () => {
    mocks.recordClick.mockRejectedValue(new Error("db down"))

    await emailTrackingService.recordTransitionOrEnqueueRepair({
      link: "https://shop.test/a",
      phase: "clicked",
      token: "tok",
      workspaceId: "w1",
    })

    expect(mocks.enqueueIntegrationJob.mock.calls[0]?.[0].data).toEqual({
      link: "https://shop.test/a",
      phase: "clicked",
      token: "tok",
      workspaceId: "w1",
    })
  })

  test("still never throws when the repair cannot be enqueued", async () => {
    mocks.recordClick.mockRejectedValue(new Error("db down"))
    mocks.enqueueIntegrationJob.mockRejectedValue(new Error("redis down"))

    await expect(
      emailTrackingService.recordTransitionOrEnqueueRepair({
        phase: "clicked",
        token: "tok",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.loggerError).toHaveBeenCalledTimes(2)
  })
})

describe("emailTrackingTransitionJobId", () => {
  const token = "3f0e2b1a-9c4d-4e57-8a61-0d2f7c9b1e44"

  test("is stable for the same recipient and phase, so a repair is enqueued once", () => {
    expect(emailTrackingTransitionJobId(token, "opened")).toBe(
      emailTrackingTransitionJobId(token, "opened"),
    )
  })

  test("differs per phase and per recipient", () => {
    expect(
      new Set([
        emailTrackingTransitionJobId(token, "opened"),
        emailTrackingTransitionJobId(token, "clicked"),
        emailTrackingTransitionJobId(`${token}x`, "opened"),
      ]).size,
    ).toBe(3)
  })

  test("never exposes the tracking token and is a valid BullMQ id", () => {
    const id = emailTrackingTransitionJobId(token, "delivered")
    expect(id).not.toContain(token)
    expect(id).not.toContain(":")
    expect(id.startsWith("email-tracking-")).toBe(true)
    expect(id.endsWith("-delivered")).toBe(true)
  })
})
