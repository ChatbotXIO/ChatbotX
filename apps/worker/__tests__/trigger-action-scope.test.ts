import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  findBy: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  openEmailThread: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findLatestCreatedByContact: mocks.findLatestCreatedByContact,
    findBy: mocks.findBy,
    openEmailThread: mocks.openEmailThread,
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

  test("an event conversationId that is not an email thread is ignored", async () => {
    mocks.findBy.mockResolvedValue({ id: "comment-thread", sourceId: "post-1" })
    const scope = createTriggerActionScope({
      ...identity,
      conversationId: "comment-thread",
    })

    await expect(scope.getConversation()).resolves.toEqual({ id: "conv-1" })
    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(1)
  })

  test("an event conversationId that is an email thread is used", async () => {
    const thread = { id: "thread-1", sourceId: "email:<a@x>" }
    mocks.findBy.mockResolvedValue(thread)
    const scope = createTriggerActionScope({
      ...identity,
      conversationId: "thread-1",
    })

    await expect(scope.getConversation()).resolves.toBe(thread)
    expect(mocks.findLatestCreatedByContact).not.toHaveBeenCalled()
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

  describe("SMTP contact without a conversation", () => {
    beforeEach(() => {
      mocks.findLatestCreatedByContact.mockResolvedValue(undefined)
      mocks.findMostRecentByContact.mockResolvedValue({
        id: "ci-1",
        inboxId: "inbox-1",
        channel: "smtp",
      })
      mocks.openEmailThread.mockResolvedValue({ id: "outreach-1" })
    })

    test("falls back to one outreach thread seeded by the run key", async () => {
      const scope = createTriggerActionScope({ ...identity, runKey: "run-1" })

      expect(await scope.getConversation()).toEqual({ id: "outreach-1" })
      expect(await scope.getOutreachConversation()).toEqual({
        id: "outreach-1",
      })
      expect(mocks.openEmailThread).toHaveBeenCalledTimes(1)
      expect(mocks.openEmailThread).toHaveBeenCalledWith(
        expect.objectContaining({ contactInboxId: "ci-1", seed: "run-1" }),
      )
    })

    test("a retry with the same run key asks for the same thread", async () => {
      await createTriggerActionScope({
        ...identity,
        runKey: "run-1",
      }).getOutreachConversation()
      await createTriggerActionScope({
        ...identity,
        runKey: "run-1",
      }).getOutreachConversation()

      const seeds = mocks.openEmailThread.mock.calls.map(
        ([arg]) => (arg as { seed: string }).seed,
      )
      expect(seeds).toEqual(["run-1", "run-1"])
    })

    test("keeps an existing conversation and skips non-SMTP contacts", async () => {
      mocks.findLatestCreatedByContact.mockResolvedValue({ id: "conv-1" })
      expect(
        await createTriggerActionScope(identity).getConversation(),
      ).toEqual({ id: "conv-1" })

      mocks.findMostRecentByContact.mockResolvedValue({
        id: "ci-2",
        channel: "messenger",
      })
      const scope = createTriggerActionScope(identity)
      expect(await scope.getOutreachConversation()).toBeUndefined()
      expect(mocks.openEmailThread).not.toHaveBeenCalled()
    })
  })
})
