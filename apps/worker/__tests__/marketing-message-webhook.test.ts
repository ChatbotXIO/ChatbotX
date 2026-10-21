import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  applyWebhook: vi.fn(),
  identify: vi.fn(),
  findLatestBySource: vi.fn(),
  findDM: vi.fn(),
  save: vi.fn(),
  warn: vi.fn(),
  tenant: vi.fn(),
  guard: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../../../packages/business/src/facebook-marketing-message-delivery/webhook",
  )
  return {
    parseMarketingMessageWebhook: actual.parseMarketingMessageWebhook,
    summarizeMarketingMessage: (c: { text?: string }) => c.text ?? "",
    facebookMarketingMessageDeliveryService: { applyWebhook: m.applyWebhook },
    contactInboxService: { findLatestBySource: m.findLatestBySource },
    conversationService: { findDMByContactInbox: m.findDM },
    resolveTenantSettings: m.tenant,
    withBlockedOwnerGuard: m.guard,
  }
})
vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: m.identify,
  },
}))
vi.mock("../src/integration/handlers/received-message", () => ({
  saveAndBroadcastMessage: m.save,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: m.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { processMarketingMessageWebhook } = await import(
  "../src/integration/handlers/marketing-message-webhook"
)

const echoValue = {
  message_id: "camp-1",
  messenger_subscription_token: "tok-abcdefghij",
  timestamp: 1_700_000_000,
  recipient_id: "psid-1",
  mid: "mid-1",
}
const job = (value: unknown = echoValue) => ({
  pageId: "page-1",
  field: "marketing_message_echoes",
  value,
})
const campaign = {
  id: "row-1",
  workspaceId: "ws-1",
  content: { templateType: "text", text: "Hello sale", quickReplies: [] },
}

beforeEach(() => {
  for (const f of Object.values(m)) {
    f.mockReset()
  }
  m.applyWebhook.mockResolvedValue({ applied: true, campaign })
  m.identify.mockResolvedValue({
    inbox: { id: "inbox-1", workspaceId: "ws-1" },
    integrationRow: {},
  })
  m.findLatestBySource.mockResolvedValue({ id: "ci-1", contactId: "c-1" })
  m.findDM.mockResolvedValue({ id: "conv-1", workspaceId: "ws-1" })
  m.tenant.mockResolvedValue({ storageUrl: "https://s" })
  m.guard.mockImplementation((_ws: string, fn: () => Promise<void>) => fn())
})

describe("processMarketingMessageWebhook", () => {
  it("invalid payload is logged and does not throw", async () => {
    await expect(
      processMarketingMessageWebhook(job({ nope: true })),
    ).resolves.toBeUndefined()
    expect(m.warn).toHaveBeenCalled()
    expect(m.applyWebhook).not.toHaveBeenCalled()
  })

  it("echo with psid and existing contact inbox saves an outgoing message", async () => {
    await processMarketingMessageWebhook(job())
    expect(m.findLatestBySource).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceId: "psid-1",
      workspaceId: "ws-1",
    })
    expect(m.save).toHaveBeenCalledTimes(1)
    const arg = m.save.mock.calls[0]?.[0]
    expect(arg.incomingMessage).toMatchObject({
      sourceId: "mid-1",
      messageType: "outgoing",
      contentType: "text",
      text: "Hello sale",
      contentAttributes: {
        metadata: { type: "marketingMessage", campaignRowId: "row-1" },
      },
    })
    expect(arg.conversation.id).toBe("conv-1")
  })

  it("uses a non-empty fallback text for media templates", async () => {
    m.applyWebhook.mockResolvedValue({
      applied: true,
      campaign: {
        ...campaign,
        content: {
          templateType: "media",
          mediaType: "image",
          media: { id: "1", mode: "url", url: "https://x.test/a.png" },
          buttons: [],
          quickReplies: [],
        },
      },
    })
    await processMarketingMessageWebhook(job())
    expect(m.save.mock.calls[0]?.[0].incomingMessage.text).toBe(
      "[Marketing message]",
    )
  })

  it("echo with psid but no contact inbox creates nothing", async () => {
    m.findLatestBySource.mockResolvedValue(undefined)
    await processMarketingMessageWebhook(job())
    expect(m.save).not.toHaveBeenCalled()
  })

  it("applied false does nothing further", async () => {
    m.applyWebhook.mockResolvedValue({ applied: false })
    await processMarketingMessageWebhook(job())
    expect(m.identify).not.toHaveBeenCalled()
    expect(m.save).not.toHaveBeenCalled()
  })

  it("deliveries field never saves an inbox message", async () => {
    await processMarketingMessageWebhook({
      ...job(),
      field: "marketing_message_deliveries",
    })
    expect(m.save).not.toHaveBeenCalled()
  })

  it("keeps the conversation unread", async () => {
    await processMarketingMessageWebhook(job())
    expect(m.save.mock.calls[0]?.[0].keepUnread).toBe(true)
  })

  it("skips when the page inbox belongs to another workspace", async () => {
    m.identify.mockResolvedValue({ inbox: { id: "i", workspaceId: "other" } })
    await processMarketingMessageWebhook(job())
    expect(m.save).not.toHaveBeenCalled()
    expect(m.warn).toHaveBeenCalled()
  })

  it("skips when the contact inbox has no conversation", async () => {
    m.findDM.mockResolvedValue(undefined)
    await processMarketingMessageWebhook(job())
    expect(m.save).not.toHaveBeenCalled()
  })

  it("blocked owner: status still applied, inbox mirror skipped", async () => {
    m.guard.mockResolvedValue(undefined)
    await processMarketingMessageWebhook(job())
    expect(m.applyWebhook).toHaveBeenCalled()
    expect(m.save).not.toHaveBeenCalled()
  })
})
