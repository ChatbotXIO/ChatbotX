// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findConversation: vi.fn(),
  resolveContactInbox: vi.fn(),
  queueAdd: vi.fn(),
  findFlow: vi.fn(),
  findIntegration: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  conversationService: {
    findByOrFail: mocks.findConversation,
    resolveContactInboxForConversation: mocks.resolveContactInbox,
  },
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

const request = { templateId: "9", inboxId: undefined, templateData: undefined }

describe("sendWhatsappTemplateToConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findConversation.mockResolvedValue({ id: "1" })
  })

  test("refuses a conversation whose resolved inbox is not WhatsApp", async () => {
    mocks.resolveContactInbox.mockResolvedValue({ channel: "messenger" })

    await expect(
      sendWhatsappTemplateToConversation({
        workspaceId: "1",
        conversationId: "1",
        request,
      }),
    ).rejects.toThrow("This conversation has no WhatsApp inbox")
    expect(mocks.queueAdd).not.toHaveBeenCalled()
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

  test("queues the send for a WhatsApp inbox", async () => {
    mocks.resolveContactInbox.mockResolvedValue({ channel: "whatsapp" })

    await sendWhatsappTemplateToConversation({
      workspaceId: "1",
      conversationId: "1",
      request,
    })
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })
})

describe("getWhatsappFlowScreens", () => {
  beforeEach(() => vi.clearAllMocks())

  test("a missing flow and another workspace's flow read identically", async () => {
    mocks.findFlow.mockRejectedValueOnce(new Error("Whatsapp flow not found"))
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
