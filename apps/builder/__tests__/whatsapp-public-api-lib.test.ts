// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findConversation: vi.fn(),
  resolveContactInbox: vi.fn(),
  queueAdd: vi.fn(),
  findFlow: vi.fn(),
  findIntegration: vi.fn(),
  listContactInboxes: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  conversationService: {
    findByOrFail: mocks.findConversation,
    resolveContactInboxForConversation: mocks.resolveContactInbox,
  },
  contactInboxService: { listByContactId: mocks.listContactInboxes },
  whatsappFlowService: { findByIdUnscoped: mocks.findFlow },
  integrationWhatsappService: { findByIdForWorkspace: mocks.findIntegration },
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatJobAction: { sendWhatsappTemplateToConversation: "send-template" },
  chatQueue: { add: mocks.queueAdd },
}))
vi.mock("@/integration", () => ({ integrations: { whatsapp: {} } }))

const { sendWhatsappTemplateToConversation } = await import(
  "@/features/messages/lib/send-whatsapp-template"
)
const { getWhatsappFlowScreens } = await import(
  "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations"
)

const { ModelNotfoundException } = await import("@chatbotx.io/database/errors")

const request = { templateId: "9", inboxId: undefined, templateData: undefined }

describe("sendWhatsappTemplateToConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findConversation.mockResolvedValue({ id: "1", contactId: "c1" })
  })

  test("refuses an explicit inboxId that is not WhatsApp", async () => {
    mocks.resolveContactInbox.mockResolvedValue({ channel: "telegram" })

    await expect(
      sendWhatsappTemplateToConversation({
        workspaceId: "1",
        conversationId: "1",
        request: { ...request, inboxId: "5" },
      }),
    ).rejects.toThrow("no WhatsApp inbox")
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("without inboxId picks the most recent WhatsApp inbox, skipping a newer Messenger one", async () => {
    mocks.listContactInboxes.mockResolvedValue([
      { id: "m", channel: "messenger", lastMessageAt: "2026-10-03" },
      { id: "w-old", channel: "whatsapp", lastMessageAt: "2026-09-01" },
      { id: "w-new", channel: "whatsapp", lastMessageAt: "2026-09-20" },
    ])

    await sendWhatsappTemplateToConversation({
      workspaceId: "1",
      conversationId: "1",
      request,
    })

    expect(mocks.queueAdd.mock.calls[0][1].data.contactInbox.id).toBe("w-new")
    expect(mocks.resolveContactInbox).not.toHaveBeenCalled()
  })

  test("without inboxId and no WhatsApp inbox is a 404", async () => {
    mocks.listContactInboxes.mockResolvedValue([
      { id: "m", channel: "messenger", lastMessageAt: null },
    ])

    await expect(
      sendWhatsappTemplateToConversation({
        workspaceId: "1",
        conversationId: "1",
        request,
      }),
    ).rejects.toThrow("Inbox not found")
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("queues the send for an explicit WhatsApp inbox", async () => {
    mocks.resolveContactInbox.mockResolvedValue({
      id: "w",
      channel: "whatsapp",
    })

    await sendWhatsappTemplateToConversation({
      workspaceId: "1",
      conversationId: "1",
      request: { ...request, inboxId: "7" },
    })
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })
})

describe("getWhatsappFlowScreens", () => {
  beforeEach(() => vi.clearAllMocks())

  test("a database failure is not reported as a missing flow", async () => {
    mocks.findFlow.mockRejectedValueOnce(new Error("connection lost"))
    await expect(
      getWhatsappFlowScreens({ workspaceId: "1", flowId: "1" }),
    ).rejects.toThrow("connection lost")
  })

  test("a missing flow and another workspace's flow read identically", async () => {
    mocks.findFlow.mockRejectedValueOnce(
      new ModelNotfoundException("Whatsapp flow not found"),
    )
    const missing = await getWhatsappFlowScreens({
      workspaceId: "1",
      flowId: "1",
    }).catch((e: Error) => e)

    mocks.findFlow.mockResolvedValueOnce({
      integrationWhatsappId: "7",
      sourceId: "s",
    })
    mocks.findIntegration.mockResolvedValueOnce(null)
    const foreign = await getWhatsappFlowScreens({
      workspaceId: "1",
      flowId: "2",
    }).catch((e: Error) => e)

    expect((missing as Error).message).toBe("WhatsApp Flow not found")
    expect((foreign as Error).message).toBe((missing as Error).message)
  })
})
