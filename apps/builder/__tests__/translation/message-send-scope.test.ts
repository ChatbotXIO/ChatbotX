// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Sending and reading messages in the Inbox is not member-scoped (it never
 * was), but translation is: an agent limited to assigned conversations
 * (`onlyAssignedContacts`) cannot spend a model call on, or read the stored
 * translation (an agent's original sentence) of, any other conversation.
 * A plain send and a plain read keep their behavior.
 */

type HandlerArgs = {
  input: Record<string, unknown>
  context: Record<string, unknown>
}
type Handler = (args: HandlerArgs) => Promise<unknown>
type ActionArgs = {
  bindArgsParsedInputs: [string, string]
  parsedInput: Record<string, unknown>
  ctx: Record<string, unknown>
}
type Action = (args: ActionArgs) => Promise<unknown>

const registered = vi.hoisted(() => ({
  routes: {} as Record<string, Handler>,
  actions: [] as Action[],
}))

vi.mock("@/orpc", () => ({
  authorizedAPI: {
    route: (route: { method: string; path: string }) => {
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "use", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: Handler) => {
        registered.routes[`${route.method} ${route.path}`] = fn
        return { handler: fn }
      }
      return chain
    },
  },
}))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware: {} }))
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: Action) => {
    registered.actions.push(fn)
    return fn
  }
  return { workspaceActionClient: chain }
})

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  accessCheck: vi.fn(),
  findByOrFail: vi.fn(),
  resolveContactInbox: vi.fn(),
  findUser: vi.fn(),
  sendOutgoing: vi.fn(),
  listMessages: vi.fn(),
  findMessage: vi.fn(),
}))

vi.mock("@/lib/public-api/member-scope", () => ({
  assertConversationAccessForCaller: mocks.assertAccess,
  lazyConversationAccessCheckForCaller: mocks.accessCheck,
}))
vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findByOrFail: mocks.findByOrFail,
    resolveContactInboxForConversation: mocks.resolveContactInbox,
  },
  userService: { findByIdOrFail: mocks.findUser },
}))
vi.mock("@/features/translation/lib/send-outgoing", () => ({
  sendOutgoing: mocks.sendOutgoing,
}))
vi.mock("@/features/messages/queries", () => ({
  listMessages: mocks.listMessages,
  findMessage: mocks.findMessage,
}))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: vi.fn(),
}))
vi.mock("@/features/messages/actions/change-message-attributes.action", () => ({
  changeMessageAttributes: vi.fn(),
}))
vi.mock("@/features/messages/actions/delete-message.action", () => ({
  deleteMessage: vi.fn(),
}))
vi.mock("@/features/messages/actions/edit-message.action", () => ({
  editMessage: vi.fn(),
}))
vi.mock("@/features/messages/lib/get-whatsapp-flow-response", () => ({
  getWhatsappFlowResponseView: vi.fn(),
}))

await import("@/features/messages/actions/create-message.action")
await import("@/features/messages/api/private")

const workspace = { id: "ws-1", ownerId: "owner-1" }
const user = { id: "user-1" }
const member = {
  userId: "user-1",
  permissions: { onlyAssignedContacts: true },
}
const expectedScope = { workspace, member, user }
const conversation = { id: "conv-1", workspaceId: "ws-1" }
const notFound = Object.assign(new Error("Conversation not found"), {
  code: "notFound",
})

const createMessageAction = (): Action => {
  const action = registered.actions[0]
  if (!action) {
    throw new Error("createMessageAction not registered")
  }
  return action
}

const route = (key: string): Handler => {
  const handler = registered.routes[key]
  if (!handler) {
    throw new Error(`${key} not registered`)
  }
  return handler
}
const createRoute = () =>
  route(
    "POST /workspaces/{workspaceId}/conversations/{conversationId}/messages",
  )
const listRoute = () => route("GET /workspaces/{workspaceId}/messages")
const findRoute = () => route("GET /workspaces/{workspaceId}/messages/{id}")

const sessionContext = { workspace, workspaceMember: member, user }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertAccess.mockResolvedValue(conversation)
  mocks.findByOrFail.mockResolvedValue(conversation)
  mocks.resolveContactInbox.mockResolvedValue({ id: "ci-1" })
  mocks.findUser.mockResolvedValue(user)
  mocks.sendOutgoing.mockResolvedValue({ id: "msg-1" })
  mocks.listMessages.mockResolvedValue({ data: [], nextCursor: null })
  mocks.findMessage.mockResolvedValue({ id: "msg-1" })
})

describe("createMessageAction (Inbox composer)", () => {
  const send = (parsedInput: Record<string, unknown>) =>
    createMessageAction()({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput,
      ctx: { workspace, workspaceMember: member, user },
    })

  test("a translated send is member-scoped", async () => {
    await send({ text: "hello", translate: true })

    expect(mocks.assertAccess).toHaveBeenCalledWith(expectedScope, "conv-1")
    expect(mocks.findByOrFail).not.toHaveBeenCalled()
    expect(mocks.sendOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({ conversation }),
    )
  })

  test("a translated send outside the scope is refused before any model call", async () => {
    mocks.assertAccess.mockRejectedValue(notFound)

    await expect(send({ text: "hello", translate: true })).rejects.toBe(
      notFound,
    )
    expect(mocks.sendOutgoing).not.toHaveBeenCalled()
  })

  test("a plain send keeps its unscoped lookup", async () => {
    await send({ text: "hello" })

    expect(mocks.assertAccess).not.toHaveBeenCalled()
    expect(mocks.findByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(mocks.sendOutgoing).toHaveBeenCalled()
  })
})

describe("private messages API", () => {
  test("a translated send is member-scoped", async () => {
    mocks.assertAccess.mockRejectedValue(notFound)

    await expect(
      createRoute()({
        input: {
          workspaceId: "ws-1",
          conversationId: "conv-1",
          text: "hello",
          translate: true,
        },
        context: sessionContext,
      }),
    ).rejects.toBe(notFound)

    expect(mocks.assertAccess).toHaveBeenCalledWith(expectedScope, "conv-1")
    expect(mocks.sendOutgoing).not.toHaveBeenCalled()
  })

  test("a plain send keeps its unscoped lookup", async () => {
    await createRoute()({
      input: { workspaceId: "ws-1", conversationId: "conv-1", text: "hello" },
      context: sessionContext,
    })

    expect(mocks.assertAccess).not.toHaveBeenCalled()
    expect(mocks.findByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(mocks.sendOutgoing).toHaveBeenCalled()
  })

  test.each([
    ["list", listRoute, mocks.listMessages],
    ["find", findRoute, mocks.findMessage],
  ] as const)("%s hides translations outside the caller's scope", async (_label, handler, query) => {
    const canSeeConversation = vi.fn()
    mocks.accessCheck.mockReturnValue(canSeeConversation)
    const input = { workspaceId: "ws-1", id: "msg-1" }

    await handler()({ input, context: sessionContext })

    expect(mocks.accessCheck).toHaveBeenCalledWith(expectedScope)
    expect(query).toHaveBeenCalledWith(input, {
      includeTranslation: true,
      canSeeConversation,
    })
  })
})
