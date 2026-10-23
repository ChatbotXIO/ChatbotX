// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ── analytics mock (the key subject of this test) ──────────────────────────
const markFailed = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: { markFailed },
}))

// ── tracking orchestration (the subject of this test) ──────────────────────
const createRecipient = vi.fn().mockResolvedValue({ token: "test-token-xyz" })
const recordTransitionOrEnqueueRepair = vi.fn().mockResolvedValue(undefined)
const recordTransition = vi.fn().mockResolvedValue(undefined)
const awardLeaderboardEmailEngagement = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  awardLeaderboardEmailEngagement,
}))

// ── business services ───────────────────────────────────────────────────────
const runAction = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ ctx: true }),
  buildUnsubscribeUrl: vi
    .fn()
    .mockResolvedValue("https://app.test/unsubscribe?token=unsub"),
  contactService: {
    findBy: vi.fn().mockResolvedValue({ emailOptIn: true }),
  },
  emailTrackingService: {
    createRecipient,
    recordTransition,
    recordTransitionOrEnqueueRepair,
  },
  inboxService: { find: vi.fn().mockResolvedValue(undefined) },
  integrationSmtpService: {
    find: vi.fn().mockResolvedValue({
      id: "smtp-1",
      name: "SMTP",
      auth: {
        authType: "custom",
        host: "smtp.test",
        port: 587,
        fromAddress: "from@test.com",
      },
    }),
  },
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ appUrl: "https://app.test" }),
  signEmailClickUrl: vi.fn().mockResolvedValue("signed-token"),
  workspaceService: {
    findById: vi.fn().mockResolvedValue({ id: "ws-1", name: "WS" }),
  },
}))

vi.mock("@chatbotx.io/integration-smtp", () => ({
  integration: { runAction },
  smtpAuthSchema: {
    parse: vi.fn((v) => v),
  },
}))

const renderDynamicEmailHtmlMock = vi.fn().mockReturnValue("<html/>")

vi.mock("@chatbotx.io/mail/dynamic", () => ({
  renderDynamicEmailHtml: renderDynamicEmailHtmlMock,
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn().mockResolvedValue([]),
    replaceAll: vi.fn(({ text }: { text: string }) => Promise.resolve(text)),
  },
}))

vi.mock("../../src/lib/convert-button", () => ({
  resolveButtonUrl: vi.fn().mockReturnValue("https://resolved-url.com/page"),
}))

vi.mock("../../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { recordEmailTrackingTransition, sendEmail } = await import(
  "../../src/integration/handlers/send-email"
)

// ── shared fixture ──────────────────────────────────────────────────────────
function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    conversation: {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
    },
    contactInbox: { id: "ci-1", inboxId: "inbox-1" },
    flowVersion: { flowId: "flow-1" },
    step: {
      integrationSmtpId: "smtp-1",
      to: "user@example.com",
      subject: "Hello",
      preheader: "preview",
      from: "from@test.com",
      elements: [],
      topicId: "topic-1",
      ...overrides,
    },
    metadata: {},
  }
}

beforeEach(() => {
  createRecipient.mockResolvedValue({ token: "test-token-xyz" })
  runAction.mockResolvedValue(undefined)
  renderDynamicEmailHtmlMock.mockReturnValue("<html/>")
})

describe("with topicId", () => {
  test("calls createRecipient with conversation identifiers and resolved email", async () => {
    await sendEmail(makeProps() as never)
    expect(createRecipient).toHaveBeenCalledOnce()
    expect(createRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: "topic-1",
        workspaceId: "ws-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        email: "user@example.com",
      }),
    )
  })

  test("embeds token in tracking pixel URL", async () => {
    await sendEmail(makeProps() as never)
    const callArg = renderDynamicEmailHtmlMock.mock.calls[0]?.[0] as {
      elements: { type: string; url?: string }[]
    }
    const pixel = callArg?.elements.find((el) => el.type === "image")
    expect(pixel?.url).toContain("r=test-token-xyz")
    expect(pixel?.url).toContain("/email-topic/open")
  })

  test("records the delivered phase with repair on send success", async () => {
    await sendEmail(makeProps() as never)
    expect(recordTransitionOrEnqueueRepair).toHaveBeenCalledOnce()
    expect(recordTransitionOrEnqueueRepair).toHaveBeenCalledWith({
      phase: "delivered",
      token: "test-token-xyz",
      workspaceId: "ws-1",
    })
    expect(markFailed).not.toHaveBeenCalled()
  })

  test("calls markFailed with token when runAction throws", async () => {
    runAction.mockRejectedValue(new Error("SMTP error"))
    await sendEmail(makeProps() as never)
    expect(markFailed).toHaveBeenCalledOnce()
    expect(markFailed).toHaveBeenCalledWith("test-token-xyz")
    expect(recordTransitionOrEnqueueRepair).not.toHaveBeenCalled()
  })

  test("never marks the send failed when only the tracking step fails", async () => {
    // The repair wrapper never throws, so SMTP success stays success.
    recordTransitionOrEnqueueRepair.mockResolvedValueOnce(undefined)
    await sendEmail(makeProps() as never)
    expect(runAction).toHaveBeenCalledOnce()
    expect(markFailed).not.toHaveBeenCalled()
  })

  test("does not send when the recipient cannot be created, so the job retries cleanly", async () => {
    createRecipient.mockRejectedValueOnce(new Error("db down"))
    await expect(sendEmail(makeProps() as never)).rejects.toThrow("db down")
    expect(runAction).not.toHaveBeenCalled()
  })
})

describe("without a topic (No Topic)", () => {
  test.each([
    undefined,
    "",
  ])("still creates a tracked recipient for topicId %j", async (topicId) => {
    await sendEmail(makeProps({ topicId }) as never)
    expect(createRecipient).toHaveBeenCalledOnce()
    expect(createRecipient.mock.calls[0]?.[0].topicId).toBeUndefined()
    expect(recordTransitionOrEnqueueRepair).toHaveBeenCalledWith({
      phase: "delivered",
      token: "test-token-xyz",
      workspaceId: "ws-1",
    })
  })

  test("still sends the email", async () => {
    await sendEmail(makeProps({ topicId: undefined }) as never)
    expect(runAction).toHaveBeenCalledOnce()
  })
})

describe("recordEmailTrackingTransition (repair job)", () => {
  test("retries only the tracking transaction, never the SMTP send", async () => {
    await recordEmailTrackingTransition({
      phase: "opened",
      token: "tok",
      workspaceId: "ws-1",
    })
    expect(recordTransition).toHaveBeenCalledWith({
      phase: "opened",
      token: "tok",
    })
    expect(runAction).not.toHaveBeenCalled()
  })

  test.each([
    ["opened", "open"],
    ["clicked", "click"],
  ] as const)("awards the %s leaderboard event the failed route missed", async (phase, kind) => {
    await recordEmailTrackingTransition({ phase, token: "tok" })
    expect(awardLeaderboardEmailEngagement).toHaveBeenCalledWith({
      kind,
      link: undefined,
      token: "tok",
    })
  })

  test("awards a click under the same per-link key the route uses", async () => {
    await recordEmailTrackingTransition({
      phase: "clicked",
      token: "tok",
      link: "https://shop.test/a",
    })
    expect(awardLeaderboardEmailEngagement).toHaveBeenCalledWith({
      kind: "click",
      link: "https://shop.test/a",
      token: "tok",
    })
  })

  test("a failing leaderboard award does not fail the job, so the transition is not re-run", async () => {
    awardLeaderboardEmailEngagement.mockRejectedValueOnce(
      new Error("redis down"),
    )

    await expect(
      recordEmailTrackingTransition({ phase: "opened", token: "tok" }),
    ).resolves.toBeUndefined()
    expect(recordTransition).toHaveBeenCalledTimes(1)
  })

  test("does not award the leaderboard for a delivered repair", async () => {
    await recordEmailTrackingTransition({ phase: "delivered", token: "tok" })
    expect(awardLeaderboardEmailEngagement).not.toHaveBeenCalled()
  })

  test("awards nothing while the transition itself still fails", async () => {
    recordTransition.mockRejectedValueOnce(new Error("db down"))
    await expect(
      recordEmailTrackingTransition({ phase: "opened", token: "tok" }),
    ).rejects.toThrow("db down")
    expect(awardLeaderboardEmailEngagement).not.toHaveBeenCalled()
  })

  test("lets a failure surface so BullMQ retries the job", async () => {
    recordTransition.mockRejectedValueOnce(new Error("db down"))
    await expect(
      recordEmailTrackingTransition({ phase: "clicked", token: "tok" }),
    ).rejects.toThrow("db down")
  })
})
