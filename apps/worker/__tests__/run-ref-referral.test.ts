import { beforeEach, describe, expect, test, vi } from "vitest"

const decodeRef = vi.fn()
const encodeRef = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  decodeRef,
  encodeRef,
}))

const findOrFail = vi.fn()
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { id: "flowModel.id" },
  flowVersionModel: { id: "flowVersionModel.id" },
  reflinkModel: { id: "reflinkModel.id" },
}))

const emit = vi.fn()
vi.mock("@chatbotx.io/event-bus", () => ({ emit }))

const emitContactReferredANewContact = vi.fn()
const emitContactReferredExistingContact = vi.fn()
vi.mock("@chatbotx.io/events", () => ({
  emitContactReferredANewContact,
  emitContactReferredExistingContact,
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "channel",
}))

const integrationQueueAdd = vi.fn()
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: integrationQueueAdd,
  },
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: vi.fn(async () => ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
      channel: "messenger",
    },
  })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("../src/integration/handlers/utils/contact", () => ({
  saveResultToCustomField: vi.fn(),
}))

const { runRef } = await import("../src/integration/handlers/ref")

describe("runRef referral events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decodeRef.mockReturnValue({ type: "reflink", name: "summer" })
    encodeRef.mockReturnValue("encoded-ref")
    findOrFail.mockResolvedValue({
      id: "reflink-1",
      flowId: "flow-1",
      customFieldId: null,
    })
    integrationQueueAdd.mockResolvedValue(undefined)
    emitContactReferredANewContact.mockResolvedValue(undefined)
    emitContactReferredExistingContact.mockResolvedValue(undefined)
  })

  test("emits new-contact referral and stamps child flow origin", async () => {
    await runRef({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      ref: "encoded-ref",
      isNewContact: true,
    })

    expect(emitContactReferredANewContact).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
      "summer",
      "reflink-1",
    )
    expect(emitContactReferredExistingContact).not.toHaveBeenCalled()
    expect(integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: {
        conversationId: expect.objectContaining({ id: "conversation-1" }),
        contactInboxId: expect.objectContaining({ id: "contact-inbox-1" }),
        flowId: "flow-1",
        origin: "channel",
      },
    })
  })

  test("treats missing isNewContact as existing-contact referral", async () => {
    await runRef({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      ref: "encoded-ref",
    })

    expect(emitContactReferredExistingContact).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
      "summer",
      "reflink-1",
    )
    expect(emitContactReferredANewContact).not.toHaveBeenCalled()
  })
})
