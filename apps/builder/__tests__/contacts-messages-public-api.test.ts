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

  const makeAPI = () => ({
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  })

  return {
    workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => makeAPI()),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const mocks = vi.hoisted(() => ({
  resolveIdByIdentifier: vi.fn(),
  resolveContactInboxForSend: vi.fn(),
  findByContactWithInboxes: vi.fn(),
  createOutgoing: vi.fn(),
  findByInboundKeyword: vi.fn(),
  listMessages: vi.fn(),
  publicFindContactMessage: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: mocks.resolveIdByIdentifier },
  conversationService: {
    resolveContactInboxForSend: mocks.resolveContactInboxForSend,
    findByContactWithInboxes: mocks.findByContactWithInboxes,
  },
  messageService: { createOutgoing: mocks.createOutgoing },
  automatedResponseService: {
    findByInboundKeyword: mocks.findByInboundKeyword,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@/features/messages/queries", () => ({
  listMessages: mocks.listMessages,
  publicFindContactMessage: mocks.publicFindContactMessage,
}))

await import("@/features/contacts/api/public/messages")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const WORKSPACE_ID = "workspace-1"
const CONTACT_ID = "contact-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveIdByIdentifier.mockResolvedValue(CONTACT_ID)
})

describe("POST /v1/contacts/{identifier}/messages", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/messages")

  test("resolves the contact inbox via resolveContactInboxForSend and sends", async () => {
    const conversation = { id: "conv-1" }
    const contactInbox = { id: "ci-1", inboxId: "inbox-1" }
    mocks.resolveContactInboxForSend.mockResolvedValueOnce({
      conversation,
      contactInbox,
    })

    await procedure.handler?.({
      context: { workspace: { id: WORKSPACE_ID } },
      input: { identifier: "id:1", text: "hello", inboxId: "inbox-1" },
    })

    expect(mocks.resolveContactInboxForSend).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      workspaceId: WORKSPACE_ID,
      inboxId: "inbox-1",
    })
    expect(mocks.createOutgoing).toHaveBeenCalledWith({
      conversation,
      contactInbox,
      input: { identifier: "id:1", text: "hello", inboxId: "inbox-1" },
    })
  })

  test("propagates the 404 when the contact has no matching inbox", async () => {
    mocks.resolveContactInboxForSend.mockRejectedValueOnce(
      new Error("Conversation not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: WORKSPACE_ID } },
        input: { identifier: "id:1", text: "hello" },
      }),
    ).rejects.toThrow("Conversation not found")

    expect(mocks.createOutgoing).not.toHaveBeenCalled()
  })
})

describe("GET /v1/contacts/{identifier}/messages", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{identifier}/messages")

  test("lists messages for the contact's conversation", async () => {
    mocks.findByContactWithInboxes.mockResolvedValueOnce({ id: "conv-1" })
    mocks.listMessages.mockResolvedValueOnce({ data: [], pageCount: 1 })

    const result = await procedure.handler?.({
      context: { workspace: { id: WORKSPACE_ID } },
      input: { identifier: "id:1", perPage: 20 },
    })

    expect(mocks.listMessages).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      conversationId: "conv-1",
      perPage: 20,
      cursor: undefined,
    })
    expect(result).toEqual({ data: [], pageCount: 1 })
  })

  test("404s when the contact has no conversation", async () => {
    mocks.findByContactWithInboxes.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: WORKSPACE_ID } },
        input: { identifier: "id:1", perPage: 20 },
      }),
    ).rejects.toThrow("Conversation not found")

    expect(mocks.listMessages).not.toHaveBeenCalled()
  })
})

describe("GET /v1/contacts/{identifier}/messages/{messageId}", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/contacts/{identifier}/messages/{messageId}",
  )

  test("returns the message scoped to the contact's conversation", async () => {
    mocks.findByContactWithInboxes.mockResolvedValueOnce({ id: "conv-1" })
    mocks.publicFindContactMessage.mockResolvedValueOnce({ id: "msg-1" })

    const result = await procedure.handler?.({
      context: { workspace: { id: WORKSPACE_ID } },
      input: { identifier: "id:1", messageId: "msg-1" },
    })

    expect(mocks.publicFindContactMessage).toHaveBeenCalledWith({
      messageId: "msg-1",
      conversationId: "conv-1",
      workspaceId: WORKSPACE_ID,
    })
    expect(result).toEqual({ id: "msg-1" })
  })

  test("404s when the contact has no conversation", async () => {
    mocks.findByContactWithInboxes.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: WORKSPACE_ID } },
        input: { identifier: "id:1", messageId: "msg-1" },
      }),
    ).rejects.toThrow("Conversation not found")
  })
})

describe("POST /v1/contacts/{identifier}/auto-replies", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/contacts/{identifier}/auto-replies",
  )

  test("404s when no automated response matches the keyword", async () => {
    mocks.findByInboundKeyword.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: WORKSPACE_ID } },
        input: { identifier: "id:1", keyword: "hello" },
      }),
    ).rejects.toThrow("No automated response found for this keyword")

    expect(mocks.resolveContactInboxForSend).not.toHaveBeenCalled()
  })

  test("404s when the contact has no matching inbox", async () => {
    mocks.findByInboundKeyword.mockResolvedValueOnce({
      flowId: null,
      text: "hi",
    })
    mocks.resolveContactInboxForSend.mockRejectedValueOnce(
      new Error("Conversation not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: WORKSPACE_ID } },
        input: { identifier: "id:1", keyword: "hello" },
      }),
    ).rejects.toThrow("Conversation not found")

    expect(mocks.createOutgoing).not.toHaveBeenCalled()
  })

  test("sends the auto-reply text through the resolved inbox", async () => {
    mocks.findByInboundKeyword.mockResolvedValueOnce({
      flowId: null,
      text: "Welcome!",
    })
    const conversation = { id: "conv-1" }
    const contactInbox = { id: "ci-1" }
    mocks.resolveContactInboxForSend.mockResolvedValueOnce({
      conversation,
      contactInbox,
    })

    await procedure.handler?.({
      context: { workspace: { id: WORKSPACE_ID } },
      input: { identifier: "id:1", keyword: "hello" },
    })

    expect(mocks.createOutgoing).toHaveBeenCalledWith({
      conversation,
      contactInbox,
      input: { text: "Welcome!", inboxId: undefined },
    })
  })
})

describe("POST /v1/contacts/{identifier}/flows", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/flows")

  test("404s when the contact has no matching inbox", async () => {
    mocks.resolveContactInboxForSend.mockRejectedValueOnce(
      new Error("Conversation not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: WORKSPACE_ID } },
        input: { identifier: "id:1", flowId: "flow-1" },
      }),
    ).rejects.toThrow("Conversation not found")

    expect(mocks.createOutgoing).not.toHaveBeenCalled()
  })

  test("sends the flow through the resolved inbox", async () => {
    const conversation = { id: "conv-1" }
    const contactInbox = { id: "ci-1" }
    mocks.resolveContactInboxForSend.mockResolvedValueOnce({
      conversation,
      contactInbox,
    })

    await procedure.handler?.({
      context: { workspace: { id: WORKSPACE_ID } },
      input: { identifier: "id:1", flowId: "flow-1", inboxId: "inbox-1" },
    })

    expect(mocks.createOutgoing).toHaveBeenCalledWith({
      conversation,
      contactInbox,
      input: { flowId: "flow-1", inboxId: "inbox-1" },
    })
  })
})
