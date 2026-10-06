// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  ChannelError,
  ChannelErrorCategory,
  ThreadControlTakeRefusedError,
} from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    orpcMock: { workspaceTokenAuthAPIForScope: () => api },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  findByOrFail: vi.fn(),
  requestConversationThreadControl: vi.fn(),
  syncConversationThreadOwner: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  class ThreadControlUnsupportedError extends Error {}
  return {
    ...actual,
    ThreadControlUnsupportedError,
    conversationService: {
      ...(actual.conversationService as object),
      findByOrFail: mocks.findByOrFail,
    },
  }
})
vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  requestConversationThreadControl: mocks.requestConversationThreadControl,
  syncConversationThreadOwner: mocks.syncConversationThreadOwner,
}))
vi.mock("@/features/conversations/queries/list-conversations.query", () => ({
  findConversation: vi.fn(),
  listConversations: vi.fn(),
}))
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/conversations/api/public")

const find = (path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === "POST" && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }
const snapshot = { contactInboxId: "ci-1", threadControlState: "owned" }
const conversation = { id: "conv-1", contactId: "contact-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByOrFail.mockResolvedValue(conversation)
})

describe("POST /v1/conversations/{id}/thread-control", () => {
  const run = (action: "take" | "release" | "pass" = "take") =>
    find("/v1/conversations/{id}/thread-control")?.({
      context,
      input: { id: "conv-1", contactInboxId: "ci-1", action },
    })

  test("applies the action to a conversation of the token's workspace", async () => {
    mocks.requestConversationThreadControl.mockResolvedValue(snapshot)

    await expect(run()).resolves.toEqual({ status: "applied", snapshot })
    expect(mocks.findByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(mocks.requestConversationThreadControl).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
      contactInboxId: "ci-1",
      action: "take",
    })
  })

  test("does not expose the bypass flag", async () => {
    mocks.requestConversationThreadControl.mockResolvedValue(snapshot)

    await run("release")

    expect(mocks.requestConversationThreadControl).toHaveBeenCalledWith(
      expect.not.objectContaining({
        bypassThreadControlLock: expect.anything(),
      }),
    )
  })

  test("a refused take is a normal notEscalation result, not an error", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ThreadControlTakeRefusedError(
        "(#2494191) Only escalation may take",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 2_494_191 },
      ),
    )

    await expect(run("take")).resolves.toEqual({ status: "notEscalation" })
  })

  test("any other channel failure is an error with the channel's message", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ChannelError(
        "(#10) Not the owner",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 10 },
      ),
    )

    await expect(run("release")).rejects.toThrow("Not the owner")
  })

  test("a contact inbox of another contact stays a 404", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ChatbotXException("Contact inbox not found", "notFound", 404),
    )

    await expect(run()).rejects.toMatchObject({ code: "notFound" })
  })

  test("a conversation outside the workspace is refused before the channel", async () => {
    mocks.findByOrFail.mockRejectedValue(
      new ChatbotXException("Conversation not found", "notFound", 404),
    )

    await expect(run()).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.requestConversationThreadControl).not.toHaveBeenCalled()
  })
})

describe("POST /v1/conversations/{id}/thread-control with action sync", () => {
  test("syncs, returns the snapshot and never asks the channel to change ownership", async () => {
    mocks.syncConversationThreadOwner.mockResolvedValue(snapshot)

    const result = await find("/v1/conversations/{id}/thread-control")?.({
      context,
      input: { id: "conv-1", contactInboxId: "ci-1", action: "sync" },
    })

    expect(result).toEqual({ status: "applied", snapshot })
    expect(mocks.syncConversationThreadOwner).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
      contactInboxId: "ci-1",
    })
    expect(mocks.requestConversationThreadControl).not.toHaveBeenCalled()
  })

  test("a conversation outside the workspace is refused before the channel", async () => {
    mocks.syncConversationThreadOwner.mockClear()
    mocks.findByOrFail.mockRejectedValueOnce(
      new ChatbotXException("Not found", "notFound", 404),
    )

    await expect(
      find("/v1/conversations/{id}/thread-control")?.({
        context,
        input: { id: "conv-x", contactInboxId: "ci-1", action: "sync" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.syncConversationThreadOwner).not.toHaveBeenCalled()
  })

  test("a channel failure during sync is mapped like the other actions", async () => {
    mocks.syncConversationThreadOwner.mockRejectedValueOnce(
      new ChannelError(
        "(#10) Not the owner",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 10 },
      ),
    )

    await expect(
      find("/v1/conversations/{id}/thread-control")?.({
        context,
        input: { id: "conv-1", contactInboxId: "ci-1", action: "sync" },
      }),
    ).rejects.toMatchObject({ code: "threadControlFailed" })
  })
})
