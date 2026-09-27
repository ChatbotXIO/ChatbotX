import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateReadStatus: vi.fn().mockResolvedValue(undefined),
  markUnread: vi.fn().mockResolvedValue({ agentLastReadAt: null }),
  findLastIncomingMessageSourceId: vi.fn(),
  findRecentByContactId: vi.fn(),
  runChannelHandler: vi.fn().mockResolvedValue(undefined),
  resolveIntegrationContextFromContactInbox: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    updateReadStatus: mocks.updateReadStatus,
    markUnread: mocks.markUnread,
    findLastIncomingMessageSourceId: mocks.findLastIncomingMessageSourceId,
  },
  contactInboxService: { findRecentByContactId: mocks.findRecentByContactId },
  contactService: {},
  inboxTeamService: {},
  workspaceMemberService: {},
}))
vi.mock("@chatbotx.io/database/client", () => ({ gte: vi.fn() }))
vi.mock("@chatbotx.io/database/schema", () => ({ conversationModel: {} }))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: { messenger: {}, instagram: {}, whatsapp: {}, api: {} },
  resolveIntegrationContextFromContactInbox:
    mocks.resolveIntegrationContextFromContactInbox,
}))
vi.mock("../src/chat/handlers/send-message", async () => {
  // `channelTypes` is a plain enum re-export (see packages/database/src/partials/channel.ts)
  // with no DB dependency, so importing it unmocked here is safe.
  const { channelTypes } = await import("@chatbotx.io/database/partials")
  return {
    sendTypingToChannel: vi.fn(),
    // Mirrors the real function's gating (packages "worker" test-double for
    // it): only WhatsApp anchors on a message id, and it does so through the
    // already-mocked `conversationService.findLastIncomingMessageSourceId`.
    resolveWhatsappMessageSourceId: vi.fn(
      async (props: {
        conversation: unknown
        contactInbox: { channel: string; id: string }
      }) =>
        props.contactInbox.channel === channelTypes.enum.whatsapp
          ? mocks.findLastIncomingMessageSourceId({
              conversation: props.conversation,
              contactInboxId: props.contactInbox.id,
            })
          : undefined,
    ),
  }
})
vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    debug: mocks.loggerDebug,
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const { stepMarkConversationAsRead, stepMarkConversationAsUnread } =
  await import("../src/integration/handlers/step-handlers")

const dmConversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  sourceId: null,
  lastActivityAt: new Date("2026-09-24T10:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

const contactInboxOn = (channel: string) => ({
  id: `ci-${channel}`,
  channel,
  contactId: "contact-1",
})

const props = (overrides: Record<string, unknown> = {}) =>
  ({
    conversation: dmConversation,
    contactInbox: contactInboxOn("messenger"),
    step: { id: "step-1", stepType: "markConversationAsRead" },
    ...overrides,
  }) as never

describe("stepMarkConversationAsUnread", () => {
  beforeEach(() => vi.clearAllMocks())

  test("clears the read marker through the service", async () => {
    await stepMarkConversationAsUnread(props())

    expect(mocks.markUnread).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-1",
    })
  })
})

describe("stepMarkConversationAsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveIntegrationContextFromContactInbox.mockResolvedValue({
      integration: { runChannelHandler: mocks.runChannelHandler },
      ctx: { auth: {} },
    })
  })

  test("marks inbox state read, then sends mark_seen on Messenger", async () => {
    await stepMarkConversationAsRead(props())

    expect(mocks.updateReadStatus).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-1",
      agentLastReadAt: expect.any(Date),
    })
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "agentMarkAsRead",
      {
        ctx: { auth: {} },
        data: {
          contact: contactInboxOn("messenger"),
          messageSourceId: undefined,
        },
      },
    )
    expect(mocks.findLastIncomingMessageSourceId).not.toHaveBeenCalled()
  })

  test("WhatsApp passes the newest incoming wamid", async () => {
    mocks.findLastIncomingMessageSourceId.mockResolvedValue("wamid.abc")

    await stepMarkConversationAsRead(
      props({ contactInbox: contactInboxOn("whatsapp") }),
    )

    expect(mocks.findLastIncomingMessageSourceId).toHaveBeenCalledWith({
      conversation: dmConversation,
      contactInboxId: "ci-whatsapp",
    })
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "agentMarkAsRead",
      expect.objectContaining({
        data: expect.objectContaining({ messageSourceId: "wamid.abc" }),
      }),
    )
  })

  test("WhatsApp with no incoming message skips the receipt", async () => {
    mocks.findLastIncomingMessageSourceId.mockResolvedValue(undefined)

    await stepMarkConversationAsRead(
      props({ contactInbox: contactInboxOn("whatsapp") }),
    )

    expect(mocks.updateReadStatus).toHaveBeenCalled()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test.each([
    "api",
    "telegram",
    "tiktok",
    "webchat",
    "zalo",
  ])("%s is inbox-state only (not in the receipt allowlist)", async (channel) => {
    await stepMarkConversationAsRead(
      props({ contactInbox: contactInboxOn(channel) }),
    )

    expect(mocks.updateReadStatus).toHaveBeenCalled()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("a comment-thread conversation never sends a DM receipt", async () => {
    await stepMarkConversationAsRead(
      props({ conversation: { ...dmConversation, sourceId: "post-1" } }),
    )

    expect(mocks.updateReadStatus).toHaveBeenCalled()
    expect(mocks.findRecentByContactId).not.toHaveBeenCalled()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("falls back to the most recent contact inbox", async () => {
    mocks.findRecentByContactId.mockResolvedValue(contactInboxOn("instagram"))

    await stepMarkConversationAsRead(props({ contactInbox: undefined }))

    expect(mocks.findRecentByContactId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(mocks.runChannelHandler).toHaveBeenCalled()
  })

  test("a channel error is logged with err and does not throw", async () => {
    const failure = new Error("(#10) outside the allowed window")
    mocks.runChannelHandler.mockRejectedValue(failure)

    await expect(stepMarkConversationAsRead(props())).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: failure,
        workspaceId: "ws-1",
        conversationId: "conv-1",
        channel: "messenger",
      }),
      "stepMarkConversationAsRead: channel receipt failed",
    )
  })

  test("an inbox-state write failure still throws", async () => {
    mocks.updateReadStatus.mockRejectedValueOnce(new Error("db down"))

    await expect(stepMarkConversationAsRead(props())).rejects.toThrow("db down")
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })
})
