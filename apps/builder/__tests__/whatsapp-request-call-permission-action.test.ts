// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const {
  findByOrFailMock,
  findInboxMock,
  createOutgoingMock,
  canCallConversationMock,
  findIntegrationMock,
  readMetaCallPermissionsMock,
  canSendCallPermissionRequestMock,
} = vi.hoisted(() => ({
  findByOrFailMock: vi.fn(),
  findInboxMock: vi.fn(),
  createOutgoingMock: vi.fn(),
  canCallConversationMock: vi.fn(),
  findIntegrationMock: vi.fn(),
  readMetaCallPermissionsMock: vi.fn(),
  canSendCallPermissionRequestMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { callingActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  canCallConversation: canCallConversationMock,
  conversationService: { findByOrFail: findByOrFailMock },
  contactInboxService: { findBy: findInboxMock },
  messageService: { createOutgoing: createOutgoingMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findIntegrationMock,
  },
}))

vi.mock(
  "../src/features/integration-whatsapp/calling/lib/meta-call-permission",
  () => ({
    readMetaCallPermissions: readMetaCallPermissionsMock,
    canSendCallPermissionRequest: canSendCallPermissionRequestMock,
  }),
)

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { requestCallPermissionAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/request-call-permission.action"
)
const action = requestCallPermissionAction as unknown as ActionHandler

const ctx = { user: { id: "agent-1" } }

const call = (text = "May we call you?") =>
  action({
    bindArgsParsedInputs: ["workspace-1", "conversation-1"],
    parsedInput: { text },
    ctx,
  })

describe("requestCallPermissionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canCallConversationMock.mockResolvedValue(true)
    findByOrFailMock.mockResolvedValue({
      id: "conversation-1",
      contactId: "contact-1",
    })
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "84349566550",
      sourceUserId: null,
    })
    createOutgoingMock.mockResolvedValue(undefined)
    findIntegrationMock.mockResolvedValue({
      id: "integration-1",
      auth: { metadata: { phoneNumber: { id: "pnid-1" } } },
    })
    readMetaCallPermissionsMock.mockResolvedValue({
      permission: { status: "no_permission" },
      actions: [],
    })
    canSendCallPermissionRequestMock.mockReturnValue(true)
  })

  test("allowed on the caller's own conversation: sends the permission request", async () => {
    await expect(call()).resolves.toBeUndefined()

    expect(canCallConversationMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      userId: "agent-1",
    })
    expect(createOutgoingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: { id: "conversation-1", contactId: "contact-1" },
      }),
    )
  })

  test("a call-access denial is translated and thrown with code callAccessDenied — never sends the message", async () => {
    canCallConversationMock.mockResolvedValue(false)

    await expect(call()).rejects.toMatchObject({
      code: "callAccessDenied",
      message: "whatsapp.calls.errors.voipCallAccessDenied",
    })

    expect(findInboxMock).not.toHaveBeenCalled()
    expect(createOutgoingMock).not.toHaveBeenCalled()
  })

  test("Meta still has request budget: sends, and asks about this contact's identity", async () => {
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "84349566550",
      sourceUserId: null,
    })

    await expect(call()).resolves.toBeUndefined()

    expect(readMetaCallPermissionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "integration-1",
        contactInboxId: "contact-inbox-1",
        target: { userWaId: "84349566550" },
      }),
    )
    expect(createOutgoingMock).toHaveBeenCalled()
  })

  test("Meta reports the request budget is spent: refuses instead of burning a message", async () => {
    canSendCallPermissionRequestMock.mockReturnValue(false)

    await expect(call()).rejects.toMatchObject({
      message: "whatsapp.calls.errors.permissionRequestLimitReached",
    })

    expect(createOutgoingMock).not.toHaveBeenCalled()
  })

  test("permission lookup unavailable: fails closed rather than spending 1 of 2 weekly requests", async () => {
    readMetaCallPermissionsMock.mockResolvedValue(undefined)

    await expect(call()).rejects.toMatchObject({
      message: "whatsapp.calls.outbound.permissionCheckFailed",
    })

    expect(canSendCallPermissionRequestMock).not.toHaveBeenCalled()
    expect(createOutgoingMock).not.toHaveBeenCalled()
  })
})
