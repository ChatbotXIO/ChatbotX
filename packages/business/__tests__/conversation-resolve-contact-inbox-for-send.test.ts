// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { conversationService } = await import("../src/conversation/service")

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

  test("falls back to the first contact inbox when inboxId is omitted", async () => {
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
    })

    expect(result.contactInbox).toEqual(contactInboxA)
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

  test("404s when the conversation has no contact inboxes at all", async () => {
    vi.spyOn(conversationService, "findByContactWithInboxes").mockResolvedValue(
      {
        id: "conv-1",
        contactInboxes: [],
      } as never,
    )

    await expect(
      conversationService.resolveContactInboxForSend({
        contactId: "contact-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
