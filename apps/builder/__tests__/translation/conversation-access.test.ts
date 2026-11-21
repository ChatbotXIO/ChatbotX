// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * The Inbox server actions and the session read route must apply the caller's
 * conversation member scope, exactly as the public API does: an agent limited
 * to assigned conversations (`onlyAssignedContacts`) cannot read or change the
 * translation state of, or spend model calls on, any other conversation.
 */

type Handler = (...args: any[]) => any

const { orpcMock, privateHandlers } = vi.hoisted(() => {
  const privateHandlers: Record<string, Handler> = {}
  return {
    privateHandlers,
    orpcMock: {
      authorizedAPI: {
        route: (route: { method: string; path: string }) => {
          const chain: Record<string, unknown> = {}
          for (const name of ["input", "use", "output", "errors"]) {
            chain[name] = () => chain
          }
          chain.handler = (fn: Handler) => {
            privateHandlers[`${route.method} ${route.path}`] = fn
            return { handler: fn }
          }
          return chain
        },
      },
    },
  }
})
vi.mock("@/orpc", () => orpcMock)
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware: {} }))
vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnFindingResource: {},
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  findByOrFail: vi.fn(),
  findBy: vi.fn(),
  getState: vi.fn(),
  updateState: vi.fn(),
  request: vi.fn(),
  preview: vi.fn(),
}))

vi.mock("@/lib/public-api/member-scope", () => ({
  assertConversationAccessForCaller: mocks.assertAccess,
}))
// An unscoped lookup would bypass the member scope; it must not be used.
vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findByOrFail: mocks.findByOrFail,
    findBy: mocks.findBy,
  },
}))
vi.mock("@/features/translation/lib/availability", () => ({
  toSettingsResource: vi.fn(),
}))
vi.mock("@/features/translation/lib/conversation-state", () => ({
  getConversationTranslationState: mocks.getState,
  updateConversationTranslationState: mocks.updateState,
}))
vi.mock("@/features/translation/lib/request-messages", () => ({
  requestTranslations: mocks.request,
}))
vi.mock("@/features/translation/lib/preview-text", () => ({
  previewTranslation: mocks.preview,
}))

const { requestTranslationsAction } = (await import(
  "@/features/translation/actions/request-messages.action"
)) as unknown as { requestTranslationsAction: Handler }
const { updateConversationTranslationStateAction } = (await import(
  "@/features/translation/actions/update-conversation-state.action"
)) as unknown as { updateConversationTranslationStateAction: Handler }
const { previewTranslationAction } = (await import(
  "@/features/translation/actions/preview-text.action"
)) as unknown as { previewTranslationAction: Handler }
await import("@/features/translation/api/private")

const workspace = { id: "ws-1" }
const user = { id: "user-1" }
const member = {
  userId: "user-1",
  permissions: { onlyAssignedContacts: true },
}
const conversation = { id: "conv-1", workspaceId: "ws-1" }
const notFound = Object.assign(new Error("Conversation not found"), {
  code: "notFound",
})

const actionCtx = { workspace, workspaceMember: member, user }
const expectedScope = { workspace, member, user }

const actions: [
  string,
  Handler,
  Record<string, unknown>,
  keyof typeof mocks,
][] = [
  [
    "requestTranslationsAction",
    requestTranslationsAction,
    { messages: [{ id: "m-1", createdAt: new Date() }] },
    "request",
  ],
  [
    "updateConversationTranslationStateAction",
    updateConversationTranslationStateAction,
    { language: "es" },
    "updateState",
  ],
  [
    "previewTranslationAction",
    previewTranslationAction,
    { text: "Hello" },
    "preview",
  ],
]

const getStateRoute = () => {
  const handler =
    privateHandlers[
      "GET /workspaces/{workspaceId}/conversations/{conversationId}/translation"
    ]
  if (!handler) {
    throw new Error("getConversationState route not registered")
  }
  return handler
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertAccess.mockResolvedValue(conversation)
})

describe("translation server actions apply the conversation member scope", () => {
  test.each(
    actions,
  )("%s checks access with the caller's membership", async (_name, action, parsedInput, lib) => {
    mocks[lib].mockResolvedValue({ ok: true })

    await action({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput,
      ctx: actionCtx,
    })

    expect(mocks.assertAccess).toHaveBeenCalledWith(expectedScope, "conv-1")
    expect(mocks[lib]).toHaveBeenCalledOnce()
    expect(mocks.findByOrFail).not.toHaveBeenCalled()
  })

  test.each(
    actions,
  )("%s stops for a conversation outside the member's scope", async (_name, action, parsedInput, lib) => {
    mocks.assertAccess.mockRejectedValue(notFound)

    await expect(
      action({
        bindArgsParsedInputs: ["ws-1", "conv-other"],
        parsedInput,
        ctx: actionCtx,
      }),
    ).rejects.toBe(notFound)

    expect(mocks.assertAccess).toHaveBeenCalledWith(expectedScope, "conv-other")
    expect(mocks[lib]).not.toHaveBeenCalled()
  })

  test("the scoped conversation is what the state update and preview use", async () => {
    await updateConversationTranslationStateAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { enabledOverride: false },
      ctx: actionCtx,
    })
    await previewTranslationAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { text: "Hello" },
      ctx: actionCtx,
    })

    expect(mocks.updateState).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
      request: { enabledOverride: false },
    })
    expect(mocks.preview).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
      request: { text: "Hello" },
    })
  })
})

describe("session getConversationState applies the conversation member scope", () => {
  const context = { workspace, workspaceMember: member, user }

  test("reads the state of a conversation the member may see", async () => {
    mocks.getState.mockResolvedValue({ language: "es" })

    const result = await getStateRoute()({
      input: { workspaceId: "ws-1", conversationId: "conv-1" },
      context,
    })

    expect(result).toEqual({ language: "es" })
    expect(mocks.assertAccess).toHaveBeenCalledWith(expectedScope, "conv-1")
    expect(mocks.getState).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
    })
    expect(mocks.findBy).not.toHaveBeenCalled()
  })

  test("a conversation outside the member's scope is not found", async () => {
    mocks.assertAccess.mockRejectedValue(notFound)

    await expect(
      getStateRoute()({
        input: { workspaceId: "ws-1", conversationId: "conv-other" },
        context,
      }),
    ).rejects.toBe(notFound)
    expect(mocks.getState).not.toHaveBeenCalled()
  })
})
