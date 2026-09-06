// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockFindByOrFail = vi.fn()
const mockFindBy = vi.fn()
const mockFindRecentByContactId = vi.fn()
const mockCreateOutgoing = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findByOrFail: (...args: unknown[]) => mockFindByOrFail(...args),
  },
  contactInboxService: {
    findBy: (...args: unknown[]) => mockFindBy(...args),
    findRecentByContactId: (...args: unknown[]) =>
      mockFindRecentByContactId(...args),
  },
  messageService: {
    createOutgoing: (...args: unknown[]) => mockCreateOutgoing(...args),
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/messages/schema/mutation", () => ({
  createMessageRequest: {},
}))

const { createMessageAction: createMessageActionUntyped } = await import(
  "../src/features/messages/actions/create-message.action"
)
const createMessageAction = createMessageActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}

const contactInbox = { id: "ci-1", inboxId: "inbox-1", contactId: "contact-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mockFindByOrFail.mockResolvedValue(conversation)
  mockFindBy.mockResolvedValue(contactInbox)
  mockFindRecentByContactId.mockResolvedValue(contactInbox)
  mockCreateOutgoing.mockResolvedValue({ id: "msg-1" })
})

describe("createMessageAction", () => {
  test("looks up the conversation scoped to the workspace", async () => {
    await createMessageAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { text: "hello" },
      ctx: { user: { id: "user-1" } },
    } as never)

    expect(mockFindByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
  })

  test("resolves the contact inbox by explicit inboxId when provided", async () => {
    await createMessageAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { text: "hello", inboxId: "inbox-2" },
      ctx: { user: { id: "user-1" } },
    } as never)

    expect(mockFindBy).toHaveBeenCalledWith({
      where: { contactId: "contact-1", inboxId: "inbox-2" },
    })
    expect(mockFindRecentByContactId).not.toHaveBeenCalled()
  })

  test("falls back to the most recent contact inbox when inboxId is absent", async () => {
    await createMessageAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { text: "hello" },
      ctx: { user: { id: "user-1" } },
    } as never)

    expect(mockFindRecentByContactId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(mockFindBy).not.toHaveBeenCalled()
  })

  test("throws when no contact inbox can be resolved", async () => {
    mockFindRecentByContactId.mockResolvedValue(undefined)

    await expect(
      createMessageAction({
        bindArgsParsedInputs: ["ws-1", "conv-1"],
        parsedInput: { text: "hello" },
        ctx: { user: { id: "user-1" } },
      } as never),
    ).rejects.toThrow("Inbox not found")

    expect(mockCreateOutgoing).not.toHaveBeenCalled()
  })

  test("delegates to messageService.createOutgoing with the resolved conversation and contact inbox", async () => {
    const result = await createMessageAction({
      bindArgsParsedInputs: ["ws-1", "conv-1"],
      parsedInput: { text: "hello", clientId: "client-1" },
      ctx: { user: { id: "user-1" } },
    } as never)

    expect(mockCreateOutgoing).toHaveBeenCalledWith({
      conversation,
      contactInbox,
      input: { text: "hello", clientId: "client-1" },
      user: { id: "user-1" },
    })
    expect(result).toEqual({ id: "msg-1" })
  })
})
