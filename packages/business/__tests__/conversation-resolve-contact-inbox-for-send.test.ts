// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { conversationService } = await import("../src/conversation/service")
const { contactInboxService } = await import("../src/contact-inbox/service")

describe("conversationService.resolveContactInboxForSend", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("resolves the contact inbox matching an explicit inboxId", async () => {
    const contactInboxA = { id: "ci-a", inboxId: "inbox-a" }
    const contactInboxB = { id: "ci-b", inboxId: "inbox-b" }
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      {
        id: "conv-1",
        contactInboxes: [contactInboxA, contactInboxB],
      } as never,
    )

    const result = await conversationService.resolveContactInboxForSend({
      contactId: "contact-1",
      workspaceId: "ws-1",
      inboxId: "inbox-b",
    })

    expect(result.contactInbox).toEqual(contactInboxB)
    expect(result.conversation.id).toBe("conv-1")
  })

  // The relation on the conversation row is keyed by `contactId`, so it holds
  // every inbox the contact has across every channel. Taking `[0]` of that
  // unordered list could address the wrong page entirely.
  test("resolves the most recently active contact inbox when inboxId is omitted", async () => {
    const stale = { id: "ci-stale", inboxId: "inbox-a" }
    const recent = { id: "ci-recent", inboxId: "inbox-b" }
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      {
        id: "conv-1",
        contactInboxes: [stale, recent],
      } as never,
    )
    const findRecent = vi
      .spyOn(contactInboxService, "findRecentByContactId")
      .mockResolvedValue(recent as never)

    const result = await conversationService.resolveContactInboxForSend({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(result.contactInbox).toEqual(recent)
    expect(findRecent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
  })

  // The DM-vs-comment-thread choice belongs to `findByContactWithInboxes` and
  // is not a flag this caller passes — that is what keeps the send path and the
  // list/get paths on the same conversation. Asserted here only so the send
  // path cannot start routing around it.
  test("takes the conversation findByContactWithInboxes settles on, passing no opt-in", async () => {
    const findConversation = vi
      .spyOn(conversationService, "findByContactWithInboxes")
      .mockResolvedValue({
        id: "conv-dm",
        sourceId: null,
        contactInboxes: [{ id: "ci-a", inboxId: "inbox-a" }],
      } as never)
    vi.spyOn(contactInboxService, "findRecentByContactId").mockResolvedValue({
      id: "ci-a",
      inboxId: "inbox-a",
    } as never)

    const result = await conversationService.resolveContactInboxForSend({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(findConversation).toHaveBeenCalledWith({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    expect(result.conversation.id).toBe("conv-dm")
  })

  // A contact who has only ever commented has no DM conversation to prefer.
  // Their comment conversation must still resolve, or comment-origin contacts
  // become unreachable through the public API.
  test("still resolves a comment conversation when the contact has no DM thread", async () => {
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      {
        id: "conv-comment",
        sourceId: "page-1_post-1",
        contactInboxes: [{ id: "ci-a", inboxId: "inbox-a" }],
      } as never,
    )
    vi.spyOn(contactInboxService, "findRecentByContactId").mockResolvedValue({
      id: "ci-a",
      inboxId: "inbox-a",
    } as never)

    const result = await conversationService.resolveContactInboxForSend({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(result.conversation.id).toBe("conv-comment")
    expect(result.contactInbox).toEqual({ id: "ci-a", inboxId: "inbox-a" })
  })

  test("404s when no conversation exists for the contact", async () => {
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      undefined,
    )

    await expect(
      conversationService.resolveContactInboxForSend({
        contactId: "contact-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("404s when the conversation exists but no contact inbox matches the given inboxId", async () => {
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      {
        id: "conv-1",
        contactInboxes: [{ id: "ci-a", inboxId: "inbox-a" }],
      } as never,
    )

    await expect(
      conversationService.resolveContactInboxForSend({
        contactId: "contact-1",
        workspaceId: "ws-1",
        inboxId: "inbox-missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("404s when the contact has no contact inbox at all", async () => {
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      {
        id: "conv-1",
        contactInboxes: [],
      } as never,
    )
    vi.spyOn(contactInboxService, "findRecentByContactId").mockResolvedValue(
      undefined,
    )

    await expect(
      conversationService.resolveContactInboxForSend({
        contactId: "contact-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
