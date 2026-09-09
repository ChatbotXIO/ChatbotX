import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const conversationService = {
  findByOrFail: vi.fn(),
  resolveContactInboxForConversation: vi.fn(),
}
const messageService = {
  findByIdWithUrls: vi.fn(),
  createOutgoing: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  conversationService,
  messageService,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

const listMessages = vi.fn()
vi.mock("@/features/messages/queries", () => ({ listMessages }))

const editMessage = vi.fn()
vi.mock("@/features/messages/actions/edit-message.action", () => ({
  editMessage,
}))

const deleteMessage = vi.fn()
vi.mock("@/features/messages/actions/delete-message.action", () => ({
  deleteMessage,
}))

const changeMessageAttributes = vi.fn()
vi.mock("@/features/messages/actions/change-message-attributes.action", () => ({
  changeMessageAttributes,
}))

vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: vi.fn(),
}))

await import("@/features/messages/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "ws-1", ownerId: "owner-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the messages public router under the inbox scope", () => {
  expect(scopeArgAtImport).toBe("inbox")
})

describe("GET /v1/conversations/{conversationId}/messages", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/conversations/{conversationId}/messages",
  )

  test("validates the conversation exists, then delegates to listMessages", async () => {
    conversationService.findByOrFail.mockResolvedValueOnce({ id: "conv-1" })
    listMessages.mockResolvedValueOnce({
      data: [],
      nextCursor: null,
      prevCursor: null,
    })

    const result = await procedure.handler?.({
      context,
      input: { conversationId: "conv-1", perPage: 20 },
    })

    expect(conversationService.findByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(listMessages).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      perPage: 20,
      cursor: undefined,
    })
    expect(result).toEqual({ data: [], nextCursor: null, prevCursor: null })
  })

  test("propagates the 404 when the conversation does not exist", async () => {
    conversationService.findByOrFail.mockRejectedValueOnce(
      new Error("Conversation not found"),
    )

    await expect(
      procedure.handler?.({
        context,
        input: { conversationId: "conv-missing", perPage: 20 },
      }),
    ).rejects.toThrow("Conversation not found")
    expect(listMessages).not.toHaveBeenCalled()
  })
})

describe("GET /v1/conversations/{conversationId}/messages/{messageId}", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/conversations/{conversationId}/messages/{messageId}",
  )

  test("delegates to messageService.findByIdWithUrls", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    messageService.findByIdWithUrls.mockResolvedValueOnce({ id: "msg-1" })

    const result = await procedure.handler?.({
      context,
      input: { conversationId: "conv-1", messageId: "msg-1", createdAt },
    })

    expect(messageService.findByIdWithUrls).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "msg-1",
      createdAt,
    })
    expect(result).toEqual({ id: "msg-1" })
  })
})

describe("POST /v1/conversations/{conversationId}/messages", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/conversations/{conversationId}/messages",
  )

  test("sends without a user — a workspace token has no user", async () => {
    conversationService.findByOrFail.mockResolvedValueOnce({
      id: "conv-1",
      contactId: "contact-1",
    })
    conversationService.resolveContactInboxForConversation.mockResolvedValueOnce(
      { id: "contact-inbox-1" },
    )
    messageService.createOutgoing.mockResolvedValueOnce({ id: "msg-1" })

    const input = { conversationId: "conv-1", text: "hello" }
    const result = await procedure.handler?.({ context, input })

    expect(
      conversationService.resolveContactInboxForConversation,
    ).toHaveBeenCalledWith({
      conversation: { id: "conv-1", contactId: "contact-1" },
      workspaceId: "ws-1",
      inboxId: undefined,
    })
    expect(messageService.createOutgoing).toHaveBeenCalledWith({
      conversation: { id: "conv-1", contactId: "contact-1" },
      contactInbox: { id: "contact-inbox-1" },
      input,
    })
    expect(messageService.createOutgoing.mock.calls[0][0]).not.toHaveProperty(
      "user",
    )
    expect(result).toEqual({ id: "msg-1" })
  })
})

describe("PATCH /v1/conversations/{conversationId}/messages/{messageId}", () => {
  const procedure = findProcedure(
    "PATCH",
    "/v1/conversations/{conversationId}/messages/{messageId}",
  )

  test("delegates to editMessage", async () => {
    editMessage.mockResolvedValueOnce({ success: true })

    const createdAt = new Date("2026-01-01T00:00:00Z")
    const result = await procedure.handler?.({
      context,
      input: {
        conversationId: "conv-1",
        messageId: "msg-1",
        createdAt,
        newText: "edited",
      },
    })

    expect(editMessage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: {
        conversationId: "conv-1",
        messageId: "msg-1",
        createdAt,
        newText: "edited",
      },
    })
    expect(result).toEqual({ success: true })
  })
})

describe("DELETE /v1/conversations/{conversationId}/messages/{messageId}", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/conversations/{conversationId}/messages/{messageId}",
  )

  test("delegates to deleteMessage with the id field it expects", async () => {
    // The route's real `.input()` chain transforms the `{messageId}` path
    // param onto `id` before the handler runs (see the router source) — this
    // capture-spy harness stubs `.input()` as a no-op, so the fixture below
    // is the already-transformed shape the handler actually receives.
    const createdAt = new Date("2026-01-01T00:00:00Z")

    await procedure.handler?.({
      context,
      input: { conversationId: "conv-1", createdAt, id: "msg-1" },
    })

    expect(deleteMessage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: { conversationId: "conv-1", createdAt, id: "msg-1" },
    })
  })
})

describe("POST /v1/conversations/{conversationId}/messages/{messageId}/attributes", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/conversations/{conversationId}/messages/{messageId}/attributes",
  )

  test("delegates to changeMessageAttributes", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")

    await procedure.handler?.({
      context,
      input: {
        conversationId: "conv-1",
        messageId: "msg-1",
        createdAt,
        liked: true,
      },
    })

    expect(changeMessageAttributes).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      parsedInput: {
        conversationId: "conv-1",
        messageId: "msg-1",
        createdAt,
        liked: true,
      },
    })
  })
})
