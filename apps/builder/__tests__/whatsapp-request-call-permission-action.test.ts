// @vitest-environment node

import { SdkException } from "@chatbotx.io/sdk"
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

const actualErrors = await vi.importActual<
  typeof import("@chatbotx.io/business/errors")
>("@chatbotx.io/business/errors")

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
  // The real helper - the point of the 138013 test is that Meta's own sentence
  // survives all the way to the thrown message, so stubbing it would prove
  // nothing.
  toPublicErrorMessage: actualErrors.toPublicErrorMessage,
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
      ok: true,
      permissions: { permission: { status: "no_permission" }, actions: [] },
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
    readMetaCallPermissionsMock.mockResolvedValue({
      ok: false,
      error: new Error("meta down"),
    })

    await expect(call()).rejects.toMatchObject({
      message: "whatsapp.calls.outbound.permissionCheckFailed",
    })

    expect(canSendCallPermissionRequestMock).not.toHaveBeenCalled()
    expect(createOutgoingMock).not.toHaveBeenCalled()
  })

  test("relays whatever Meta said, never the generic retry prompt", async () => {
    readMetaCallPermissionsMock.mockResolvedValue({
      ok: false,
      error: new SdkException(
        "Business-initiated calling is not available.",
        138_013,
        400,
        2_593_139,
        "OAuthException",
      ),
    })

    await expect(call()).rejects.toMatchObject({
      message: expect.stringContaining(
        "Business-initiated calling is not available",
      ),
    })

    expect(canSendCallPermissionRequestMock).not.toHaveBeenCalled()
    expect(createOutgoingMock).not.toHaveBeenCalled()
  })
})
