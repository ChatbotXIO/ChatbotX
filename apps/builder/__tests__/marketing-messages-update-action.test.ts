import { beforeEach, describe, expect, test, vi } from "vitest"

const calls: string[] = []
const updateMessageCampaign = vi.fn(() => {
  calls.push("metaUpdate")
  return Promise.resolve()
})
const update = vi.fn(() => {
  calls.push("dbUpdate")
  return Promise.resolve({ id: "row-1" })
})
const find = vi.fn()

class ChatbotXException extends Error {
  code: string
  constructor(message: string, code = "systemError") {
    super(message)
    this.code = code
  }
}
// Stand-in for the business service's lock (covered by its own unit test):
// refuses any content change once `firstSentAt` is set.
const assertContentEditable = vi.fn(
  ({
    row,
    content,
  }: {
    row: { firstSentAt?: Date | null; content: unknown }
    content: unknown
  }) => {
    if (
      row.firstSentAt &&
      JSON.stringify(row.content) !== JSON.stringify(content)
    ) {
      throw new ChatbotXException("mmContentLocked", "mmContentLocked")
    }
  },
)
const resolveContentAttachments = vi.fn(({ content }: { content: unknown }) =>
  Promise.resolve(content),
)

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  updateMessageCampaign,
}))
vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessagesService: {
    find,
    update,
    assertContentEditable,
  },
}))
vi.mock("@chatbotx.io/business/errors", () => ({ ChatbotXException }))
vi.mock("@/features/facebook-marketing-messages/lib/media-attachment", () => ({
  resolveContentAttachments,
}))
vi.mock("@/features/facebook-marketing-messages/lib/grant", () => ({
  requireValidGrant: vi.fn(() =>
    Promise.resolve({
      state: "valid",
      accessToken: "TOKEN",
      version: "v25.0",
      facebookUserId: "asuid-1",
    }),
  ),
}))

// The action client pulls auth -> business -> the database client, which reads
// server-only env. This test exercises the orchestration, not the wrapper.
vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (handler: unknown) => handler }),
    }),
  },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))

const { updateMarketingMessage } = await import(
  "@/features/facebook-marketing-messages/lib/campaign-operations"
)

const workspace = { id: "w1" } as never
const existing = {
  id: "row-1",
  workspaceId: "w1",
  campaignId: "campaign-1",
  pageId: "page-1",
  adAccountId: "act_123",
  currency: "USD",
  currencyOffset: 100,
  budgetType: "lifetime" as const,
  content: { templateType: "text", text: "Old", quickReplies: [] },
}
const input = {
  name: "Renamed",
  budgetMajorUnits: 900,
  content: { templateType: "text" as const, text: "New", quickReplies: [] },
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  find.mockResolvedValue(existing)
})

describe("updateMarketingMessage", () => {
  test("pushes to Meta before touching the database", async () => {
    await updateMarketingMessage({ workspace, id: "row-1", input })

    expect(calls).toEqual(["metaUpdate", "dbUpdate"])
  })

  test("targets the stored campaign id with the converted budget", async () => {
    await updateMarketingMessage({ workspace, id: "row-1", input })

    expect(updateMessageCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-1",
        name: "Renamed",
        budgetType: "lifetime",
        budgetMinorUnits: 90_000,
      }),
    )
  })

  test("reuses the stored budget type — switching daily <-> lifetime needs an end_time the form never collects", async () => {
    find.mockResolvedValue({ ...existing, budgetType: "daily" })

    await updateMarketingMessage({
      workspace,
      id: "row-1",
      // A client that submits a different type must not flip the ad set.
      input: { ...input, budgetType: "lifetime" } as never,
    })

    expect(updateMessageCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ budgetType: "daily" }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ budgetType: "daily" }),
    )
  })

  test("reuses the stored currency — it is frozen after creation", async () => {
    await updateMarketingMessage({ workspace, id: "row-1", input })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ budgetMinorUnits: 90_000 }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({ adAccountId: expect.anything() }),
    )
  })

  test("leaves the row untouched when Meta rejects the update", async () => {
    updateMessageCampaign.mockRejectedValueOnce(new Error("Invalid budget"))

    await expect(
      updateMarketingMessage({ workspace, id: "row-1", input }),
    ).rejects.toThrow("Invalid budget")
    expect(update).not.toHaveBeenCalled()
  })

  test("passes the previous content so an unchanged media url is not re-uploaded", async () => {
    await updateMarketingMessage({ workspace, id: "row-1", input })

    expect(resolveContentAttachments).toHaveBeenCalledWith(
      expect.objectContaining({ previous: existing.content }),
    )
  })

  test("campaigns.update rejects content change after firstSentAt with mmContentLocked", async () => {
    find.mockResolvedValue({ ...existing, firstSentAt: new Date() })

    await expect(
      updateMarketingMessage({ workspace, id: "row-1", input }),
    ).rejects.toMatchObject({ code: "mmContentLocked" })
    // Refused before any side effect: no upload, no Meta call, no write.
    expect(resolveContentAttachments).not.toHaveBeenCalled()
    expect(updateMessageCampaign).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  test("campaigns.update allows a budget change after firstSentAt", async () => {
    find.mockResolvedValue({ ...existing, firstSentAt: new Date() })

    await updateMarketingMessage({
      workspace,
      id: "row-1",
      input: { ...input, content: existing.content as never },
    })

    expect(updateMessageCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ budgetMinorUnits: 90_000 }),
    )
    expect(update).toHaveBeenCalled()
  })

  test("F3: a content edit that loses the race to the first send surfaces a translated mmContentLocked", async () => {
    update.mockRejectedValueOnce(
      new ChatbotXException("mmContentLocked", "mmContentLocked"),
    )

    await expect(
      updateMarketingMessage({ workspace, id: "row-1", input }),
    ).rejects.toMatchObject({
      code: "mmContentLocked",
      message: "facebookMarketingMessages.errors.mmContentLocked",
    })
  })

  test("refuses a row from another workspace", async () => {
    find.mockResolvedValue(null)

    await expect(
      updateMarketingMessage({ workspace, id: "row-1", input }),
    ).rejects.toThrow()
    expect(updateMessageCampaign).not.toHaveBeenCalled()
  })
})
