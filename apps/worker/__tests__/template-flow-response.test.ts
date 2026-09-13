import {
  buttonStepDefaultFn,
  encodeTemplateFlowToken,
  TemplateFlowOrigin,
  WA_TEMPLATE_FLOW_COMPLETE_BUTTON_LABEL,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findBroadcastByIdForResponse = vi.fn()
const applyWhatsappFlowResponse = vi.fn(async () => undefined)
const enqueueFlowAction = vi.fn(async () => undefined)
const detectConversationAndContactInbox = vi.fn()
const detectFlowVersion = vi.fn()
const loggerWarn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  automatedResponseService: {
    enqueueFlowAction: (...args: unknown[]) => enqueueFlowAction(...args),
  },
  broadcastService: {
    findByIdForResponse: (...args: unknown[]) =>
      findBroadcastByIdForResponse(...args),
  },
  whatsappFlowResponseService: {
    applyResponse: (...args: unknown[]) => applyWhatsappFlowResponse(...args),
  },
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: (...args: unknown[]) =>
    detectConversationAndContactInbox(...args),
  detectFlowVersion: (...args: unknown[]) => detectFlowVersion(...args),
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

const makeJobData = (templateFlowToken: string) => ({
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  messageId: "msg-1",
  templateFlowToken,
  flowResponse: {
    email: "user@example.com",
    phone: "+84900000000",
  },
})

const makeFlowParam = (flowSourceId = "wa-flow-1") => ({
  sub_type: "flow" as const,
  index: 0,
  flowSourceId,
  fieldMappings: [{ paramKey: "email", customFieldId: "cf-email" }],
})

const makeSendTemplateStep = (props: {
  button?: unknown[]
  buttons?: unknown[]
}) => ({
  id: "11612473309626370",
  stepType: "sendWaTemplateMessage",
  template: {
    params: { button: props.button },
  },
  buttons: props.buttons ?? [
    buttonStepDefaultFn({ label: "Delivered" }),
    buttonStepDefaultFn({ label: "Failed" }),
  ],
})

describe("captureTemplateFlowResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detectConversationAndContactInbox.mockResolvedValue({
      conversation,
      contactInbox,
    })
    findBroadcastByIdForResponse.mockResolvedValue(null)
    detectFlowVersion.mockRejectedValue(new Error("missing flow version"))
  })

  test("applies response for broadcast-origin top-level FLOW button", async () => {
    const param = makeFlowParam()
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: { button: [param] },
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(findBroadcastByIdForResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "11612473309626368",
      inboxId: "inbox-1",
    })
    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox,
      integrationWhatsappId: "wa-integration-1",
      flowSourceId: "wa-flow-1",
      fieldMappings: param.fieldMappings,
      flowResponse: {
        email: "user@example.com",
        phone: "+84900000000",
      },
    })
  })

  test("applies a multi-page broadcast response with the responding page's params and no legacy integration", async () => {
    // A multi-page broadcast keeps its params per target and leaves the
    // legacy `integrationWhatsappId` null: the service resolves the params by
    // the responding contact's inbox, and `applyResponse` falls back to that
    // inbox's WhatsApp integration.
    const param = makeFlowParam("wa-flow-page-b")
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: null,
      templateData: { button: [param] },
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(findBroadcastByIdForResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "11612473309626368",
      inboxId: "inbox-1",
    })
    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInbox,
        integrationWhatsappId: null,
        flowSourceId: "wa-flow-page-b",
      }),
    )
  })

  test("skips a multi-page broadcast response when the responding page has no params", async () => {
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: null,
      templateData: null,
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: "11612473309626368" }),
      "[template-flow-response] broadcast FLOW button params not found",
    )
  })

  test("applies response for broadcast-origin carousel FLOW button", async () => {
    const param = makeFlowParam("wa-flow-carousel")
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: {
        carousel: [
          { card_index: 0, button: [makeFlowParam("wrong-flow")] },
          { card_index: 2, button: [param] },
        ],
      },
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
      cardIndex: 2,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        flowSourceId: "wa-flow-carousel",
        fieldMappings: param.fieldMappings,
      }),
    )
  })

  test("applies response for flow-step-origin FLOW button", async () => {
    const param = {
      ...makeFlowParam("wa-flow-step"),
      responseDumpFieldId: "cf-dump",
    }
    const flowCompleteButton = buttonStepDefaultFn({
      id: "btn-flow-complete",
      label: WA_TEMPLATE_FLOW_COMPLETE_BUTTON_LABEL,
    })
    detectFlowVersion.mockResolvedValue({
      flowVersion: {
        nodes: [
          {
            data: {
              details: {
                steps: [
                  makeSendTemplateStep({
                    button: [param],
                    buttons: [
                      buttonStepDefaultFn({ label: "Delivered" }),
                      buttonStepDefaultFn({ label: "Failed" }),
                      flowCompleteButton,
                    ],
                  }),
                ],
              },
            },
          },
        ],
      },
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      stepId: "11612473309626370",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(detectFlowVersion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
    })
    expect(applyWhatsappFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationWhatsappId: undefined,
        flowSourceId: "wa-flow-step",
        fieldMappings: param.fieldMappings,
        responseDumpFieldId: "cf-dump",
      }),
    )
    expect(enqueueFlowAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "postback",
        data: expect.objectContaining({
          action: expect.stringContaining("btn-flow-complete"),
        }),
      }),
    )
  })

  test("skips when conversation belongs to another workspace", async () => {
    detectConversationAndContactInbox.mockResolvedValue({
      conversation: { ...conversation, workspaceId: "ws-other" },
      contactInbox,
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(findBroadcastByIdForResponse).not.toHaveBeenCalled()
    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationWorkspaceId: "ws-other",
      }),
      "[template-flow-response] workspace mismatch",
    )
  })

  test("skips when broadcast is missing", async () => {
    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        broadcastId: "11612473309626368",
      }),
      "[template-flow-response] broadcast not found",
    )
  })

  test("skips when resolved button is not a FLOW button", async () => {
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: {
        button: [{ sub_type: "quick_reply", index: 0, payload: "payload" }],
      },
    })

    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        buttonIndex: 0,
      }),
      "[template-flow-response] broadcast FLOW button params not found",
    )
  })

  test("skips when flow version is missing", async () => {
    const token = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      stepId: "11612473309626370",
      buttonIndex: 0,
    })

    await captureTemplateFlowResponse(makeJobData(token))

    expect(applyWhatsappFlowResponse).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: "11612473309626368",
        flowVersionId: "11612473309626369",
      }),
      "[template-flow-response] flow version not found",
    )
  })
})
