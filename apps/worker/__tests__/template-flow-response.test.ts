import {
  encodeTemplateFlowToken,
  TemplateFlowOrigin,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

// Resolving the token to a template FLOW button lives in
// `@chatbotx.io/business` (`resolveTemplateFlowButton`, covered by
// packages/business/__tests__/resolve-sent-whatsapp-flow.test.ts); this file
// covers the worker's job: guard the workspace, then apply the response.
const resolveTemplateFlowButton = vi.fn()
const applyWhatsappFlowResponse = vi.fn(async () => undefined)
const detectConversationAndContactInbox = vi.fn()
const loggerWarn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  resolveTemplateFlowButton: (...args: unknown[]) =>
    resolveTemplateFlowButton(...args),
  whatsappFlowResponseService: {
    applyResponse: (...args: unknown[]) => applyWhatsappFlowResponse(...args),
  },
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: (...args: unknown[]) =>
    detectConversationAndContactInbox(...args),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarn(...args),
  },
}))

const { captureTemplateFlowResponse } = await import(
  "../src/integration/handlers/template-flow-response"
)

const contactInbox = { id: "ci-1", inboxId: "inbox-1" }
const conversation = {
  id: "conv-1",
  contactId: "contact-1",
  workspaceId: "ws-1",
}

const flowResponse = {
  email: "user@example.com",
  phone: "+84900000000",
}

const makeJobData = (templateFlowToken: string) => ({
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  messageId: "msg-1",
  templateFlowToken,
  flowResponse,
})

const param = {
  sub_type: "flow" as const,
  index: 0,
  flowSourceId: "wa-flow-1",
  fieldMappings: [{ paramKey: "email", customFieldId: "cf-email" }],
}

const token = encodeTemplateFlowToken({
  origin: TemplateFlowOrigin.Broadcast,
  broadcastId: "11612473309626368",
  buttonIndex: 0,
})

describe("captureTemplateFlowResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detectConversationAndContactInbox.mockResolvedValue({
      conversation,
      contactInbox,
    })
    resolveTemplateFlowButton.mockResolvedValue(null)
  })

  test("applies the response to the resolved FLOW button", async () => {
    resolveTemplateFlowButton.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      flowSourceId: "wa-flow-1",
      param,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(resolveTemplateFlowButton).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: TemplateFlowOrigin.Broadcast,
        broadcastId: "11612473309626368",
      }),
      { workspaceId: "ws-1", inboxId: "inbox-1" },
    )
    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox,
      integrationWhatsappId: "wa-integration-1",
      flowSourceId: "wa-flow-1",
      fieldMappings: param.fieldMappings,
      flowResponse,
    })
  })

  test("applies with no field mappings when the button has none", async () => {
    resolveTemplateFlowButton.mockResolvedValue({
      flowSourceId: "wa-flow-step",
      param: { ...param, fieldMappings: undefined },
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationWhatsappId: undefined,
        flowSourceId: "wa-flow-step",
        fieldMappings: [],
      }),
    )
  })

  test("skips when the token is invalid", async () => {
    await captureTemplateFlowResponse(makeJobData("not-a-template-token"))

    expect(resolveTemplateFlowButton).not.toHaveBeenCalled()
    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msg-1" }),
      "[template-flow-response] invalid token",
    )
  })

  test("skips when conversation belongs to another workspace", async () => {
    detectConversationAndContactInbox.mockResolvedValue({
      conversation: { ...conversation, workspaceId: "ws-other" },
      contactInbox,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(resolveTemplateFlowButton).not.toHaveBeenCalled()
    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationWorkspaceId: "ws-other",
      }),
      "[template-flow-response] workspace mismatch",
    )
  })

  test("skips when the FLOW button cannot be resolved", async () => {
    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
  })
})
