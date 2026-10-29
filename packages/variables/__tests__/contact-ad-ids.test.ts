import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listAdIds: vi.fn() }))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {},
  contactNoteService: {},
  contactReferralEventService: { listAdIds: mocks.listAdIds },
  tagService: {},
}))

const { CONTACT_AD_IDS_LIMIT } = await import("@chatbotx.io/database/partials")
const { getFirstContactAdId, listContactAdIdsString } = await import(
  "../src/helpers/contact"
)

describe("listContactAdIdsString", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("joins the contact's ad ids in the order the log returns them", async () => {
    mocks.listAdIds.mockResolvedValue(["ad-1", "ad-2", "ad-3"])

    await expect(
      listContactAdIdsString("contact-1", "workspace-1"),
    ).resolves.toBe("ad-1, ad-2, ad-3")
  })

  test("is bounded so a heavy clicker cannot flood a message", async () => {
    mocks.listAdIds.mockResolvedValue([])

    await listContactAdIdsString("contact-1", "workspace-1")

    expect(mocks.listAdIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      limit: CONTACT_AD_IDS_LIMIT,
    })
  })

  test("is null for a contact that never came from an ad", async () => {
    mocks.listAdIds.mockResolvedValue([])

    await expect(
      listContactAdIdsString("contact-1", "workspace-1"),
    ).resolves.toBeNull()
  })
})

describe("getFirstContactAdId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("asks the log for just the oldest ad", async () => {
    mocks.listAdIds.mockResolvedValue(["ad-1"])

    await expect(getFirstContactAdId("contact-1", "workspace-1")).resolves.toBe(
      "ad-1",
    )
    expect(mocks.listAdIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      limit: 1,
    })
  })

  test("is null for a contact that never came from an ad", async () => {
    mocks.listAdIds.mockResolvedValue([])

    await expect(
      getFirstContactAdId("contact-1", "workspace-1"),
    ).resolves.toBeNull()
  })
})
