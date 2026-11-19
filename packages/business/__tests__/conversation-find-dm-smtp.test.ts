import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macAnalyticsService: {} }))

const { conversationService } = await import("../src/conversation/service")
const { contactInboxService } = await import("../src/contact-inbox/service")

const props = {
  workspaceId: "ws-1",
  contactId: "contact-1",
  contactInboxId: "ci-1",
}

describe("conversationService.findDMByContactInbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("returns the latest email conversation for an SMTP contact, which has no DM", async () => {
    vi.spyOn(contactInboxService, "findBy").mockResolvedValue({
      id: "ci-1",
      channel: "smtp",
    } as never)
    const latestSmtp = vi
      .spyOn(conversationService, "findLatestSmtpConversationByContact")
      .mockResolvedValue({ id: "email-conv" } as never)
    const dm = vi.spyOn(conversationService, "findDMByContact")

    const result = await conversationService.findDMByContactInbox(props)

    expect(result).toEqual({ id: "email-conv" })
    expect(latestSmtp).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", contactId: "contact-1" }),
    )
    expect(dm).not.toHaveBeenCalled()
  })

  test("keeps the DM lookup for every other channel", async () => {
    vi.spyOn(contactInboxService, "findBy").mockResolvedValue({
      id: "ci-1",
      channel: "messenger",
    } as never)
    const latestSmtp = vi.spyOn(
      conversationService,
      "findLatestSmtpConversationByContact",
    )
    vi.spyOn(conversationService, "findDMByContact").mockResolvedValue({
      id: "dm",
    } as never)

    expect(await conversationService.findDMByContactInbox(props)).toEqual({
      id: "dm",
    })
    expect(latestSmtp).not.toHaveBeenCalled()
  })
})
