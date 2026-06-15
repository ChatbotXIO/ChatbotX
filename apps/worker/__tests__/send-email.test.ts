// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ── analytics mock (the key subject of this test) ──────────────────────────
const createRecipient = vi.fn().mockResolvedValue({ token: "test-token-xyz" })
const markDelivered = vi.fn().mockResolvedValue(undefined)
const markFailed = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: { createRecipient, markDelivered, markFailed },
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

const { sendEmail } = await import("../../src/integration/handlers/send-email")

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

  test("calls markDelivered with token on send success", async () => {
    await sendEmail(makeProps() as never)
    expect(markDelivered).toHaveBeenCalledOnce()
    expect(markDelivered).toHaveBeenCalledWith("test-token-xyz")
    expect(markFailed).not.toHaveBeenCalled()
  })

  test("calls markFailed with token when runAction throws", async () => {
    runAction.mockRejectedValue(new Error("SMTP error"))
    await sendEmail(makeProps() as never)
    expect(markFailed).toHaveBeenCalledOnce()
    expect(markFailed).toHaveBeenCalledWith("test-token-xyz")
    expect(markDelivered).not.toHaveBeenCalled()
  })
})

describe("without topicId", () => {
  test("does not call any analytics methods", async () => {
    await sendEmail(makeProps({ topicId: undefined }) as never)
    expect(createRecipient).not.toHaveBeenCalled()
    expect(markDelivered).not.toHaveBeenCalled()
    expect(markFailed).not.toHaveBeenCalled()
  })

  test("still sends the email", async () => {
    await sendEmail(makeProps({ topicId: undefined }) as never)
    expect(runAction).toHaveBeenCalledOnce()
  })
})
