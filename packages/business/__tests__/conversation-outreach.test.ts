// @vitest-environment node
import { integrationSmtpRepository } from "@chatbotx.io/database/repositories"
import { afterEach, describe, expect, test, vi } from "vitest"
import { contactInboxService } from "../src/contact-inbox/service"
import { conversationService } from "../src/conversation/service"

const smtpContactInbox = {
  id: "smtp-contact-inbox",
  contactId: "contact-1",
  channel: "smtp",
  inboxId: "inbox-1",
} as never

const messengerContactInbox = {
  id: "messenger-contact-inbox",
  contactId: "contact-1",
  channel: "messenger",
} as never

afterEach(() => vi.restoreAllMocks())

describe("resolveOutreachConversation", () => {
  test("opens a seeded email thread for SMTP", async () => {
    const thread = { id: "email-thread" } as never
    const openEmailThread = vi
      .spyOn(conversationService, "openEmailThread")
      .mockResolvedValue(thread)

    await expect(
      conversationService.resolveOutreachConversation({
        workspaceId: "workspace-1",
        contactInbox: smtpContactInbox,
        seed: "broadcast-1:smtp-contact-inbox",
      }),
    ).resolves.toBe(thread)

    expect(openEmailThread).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "smtp-contact-inbox",
      contactInbox: smtpContactInbox,
      seed: "broadcast-1:smtp-contact-inbox",
      tx: undefined,
    })
  })

  test("uses the configured sender domain and a stable seed for SMTP threads", async () => {
    vi.spyOn(contactInboxService, "findByUncached").mockResolvedValue({
      id: "smtp-contact-inbox",
      contactId: "contact-1",
      inboxId: "inbox-1",
    } as never)
    vi.spyOn(integrationSmtpRepository, "findByInbox").mockResolvedValue({
      fromAddress: "Support <support@example.test>",
    } as never)
    const findOrCreate = vi
      .spyOn(conversationService, "findOrCreate")
      .mockResolvedValue({ id: "thread-1" } as never)

    await conversationService.openEmailThread({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      contactInboxId: "smtp-contact-inbox",
      seed: "broadcast-1:smtp-contact-inbox",
    })

    expect(findOrCreate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      sourceId: "email:<broadcast-1%3Asmtp-contact-inbox@example.test>",
      channelConversationId:
        "email:<broadcast-1%3Asmtp-contact-inbox@example.test>",
      tx: expect.anything(),
    })
  })

  test("keeps non-SMTP outreach in the direct-message conversation", async () => {
    const directMessage = { id: "direct-message" } as never
    const findOrCreate = vi
      .spyOn(conversationService, "findOrCreate")
      .mockResolvedValue(directMessage)

    await expect(
      conversationService.resolveOutreachConversation({
        workspaceId: "workspace-1",
        contactInbox: messengerContactInbox,
        seed: "ignored-for-direct-messages",
      }),
    ).resolves.toBe(directMessage)

    expect(findOrCreate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      sourceId: null,
      tx: undefined,
    })
  })
})
