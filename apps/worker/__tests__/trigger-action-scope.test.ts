import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findLatestCreatedByContact: mocks.findLatestCreatedByContact,
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findByIdForContact: mocks.findByIdForContact,
    findMostRecentByContact: mocks.findMostRecentByContact,
  },
}))

const { createTriggerActionScope } = await import(
  "../src/trigger/services/actions/scope"
)

const identity = { contactId: "contact-1", workspaceId: "ws-1" }

describe("createTriggerActionScope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findLatestCreatedByContact.mockResolvedValue({ id: "conv-1" })
    mocks.findMostRecentByContact.mockResolvedValue({ id: "ci-1" })
  })

  test("reads the conversation and the contact inbox once per run", async () => {
    const scope = createTriggerActionScope(identity)

    await scope.getConversation()
    await scope.getConversation()
    await scope.getContactInbox()
    await scope.getContactInbox()

    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(1)
    expect(mocks.findMostRecentByContact).toHaveBeenCalledTimes(1)
  })

  test("is lazy: nothing is read until an action asks", () => {
    createTriggerActionScope(identity)

    expect(mocks.findLatestCreatedByContact).not.toHaveBeenCalled()
    expect(mocks.findMostRecentByContact).not.toHaveBeenCalled()
  })

  test("invalidating the conversation re-reads it for the next action", async () => {
    const scope = createTriggerActionScope(identity)
    await scope.getConversation()

    scope.invalidateConversation()
    await scope.getConversation()

    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(2)
  })

  test("a failed lookup is retried by the next action instead of cached", async () => {
    mocks.findLatestCreatedByContact
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ id: "conv-1" })
    const scope = createTriggerActionScope(identity)

    await expect(scope.getConversation()).rejects.toThrow("db down")
    await expect(scope.getConversation()).resolves.toEqual({ id: "conv-1" })
  })

  test("prefers the threaded contact inbox id over the most recent inbox", async () => {
    mocks.findByIdForContact.mockResolvedValue({ id: "ci-threaded" })
    const scope = createTriggerActionScope({
      ...identity,
      contactInboxId: "ci-threaded",
    })

    await expect(scope.getContactInbox()).resolves.toEqual({
      id: "ci-threaded",
    })
    expect(mocks.findMostRecentByContact).not.toHaveBeenCalled()
  })
})
