import { beforeEach, describe, expect, test, vi } from "vitest"

// Hoisted: Biome's useTopLevelRegex forbids a regex literal inside a function.
const TOS_URL_PATTERN = /customaudiences\/tos/

const calls: string[] = []

const createMessageCampaign = vi.fn(() => {
  calls.push("createCampaign")
  return Promise.resolve({ id: "campaign-1" })
})
const resolveContentAttachments = vi.fn(({ content }: { content: unknown }) => {
  calls.push("uploadAttachment")
  return Promise.resolve(content)
})
const create = vi.fn(() => {
  calls.push("dbInsert")
  return Promise.resolve({ id: "row-1" })
})
type AdAccountStub = {
  id: string
  accountId: string
  currency: string
  tosAccepted: Record<string, number>
}
const getMarketingMessagesAdAccounts = vi.fn(
  (): Promise<AdAccountStub[]> =>
    Promise.resolve([
      {
        id: "act_123",
        accountId: "123",
        currency: "USD",
        tosAccepted: { custom_audience_tos: 1 },
      },
    ]),
)

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  createMessageCampaign,
  getMarketingMessagesAdAccounts,
}))
vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessagesService: { create },
}))
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

// Interpolates `values` so the ToS message still carries the remediation URL.
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string, values?: Record<string, unknown>) =>
      values?.url ? `${key} ${values.url}` : key,
    ),
}))

const { createMarketingMessage } = await import(
  "@/features/facebook-marketing-messages/actions/create.action"
)

const workspace = { id: "w1" } as never
const input = {
  name: "Spring promo",
  pageId: "page-1",
  adAccountId: "act_123",
  currency: "USD",
  budgetType: "daily" as const,
  budgetMajorUnits: 30,
  content: {
    templateType: "media" as const,
    mediaType: "image" as const,
    media: {
      id: "m1",
      mode: "file" as const,
      url: "https://cdn.example.com/a.jpg",
    },
    buttons: [],
    quickReplies: [],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
})

describe("createMarketingMessage", () => {
  test("uploads the attachment, creates the campaign, then inserts the row", async () => {
    await createMarketingMessage({ workspace, input })

    expect(calls).toEqual(["uploadAttachment", "createCampaign", "dbInsert"])
  })

  test("converts the budget to minor units and records the offset", async () => {
    await createMarketingMessage({ workspace, input })

    expect(createMessageCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ budgetType: "daily", budgetMinorUnits: 3000 }),
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetMinorUnits: 3000,
        currencyOffset: 100,
        currency: "USD",
      }),
    )
  })

  test("stores the campaign id and the granting App-Scoped User ID", async () => {
    await createMarketingMessage({ workspace, input })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "campaign-1",
        facebookUserId: "asuid-1",
      }),
    )
  })

  test("inserts nothing when Meta rejects the campaign", async () => {
    createMessageCampaign.mockRejectedValueOnce(new Error("Budget too low"))

    await expect(createMarketingMessage({ workspace, input })).rejects.toThrow(
      "Budget too low",
    )
    expect(create).not.toHaveBeenCalled()
  })

  test("inserts nothing and never calls Meta when the attachment upload fails", async () => {
    resolveContentAttachments.mockRejectedValueOnce(new Error("upload failed"))

    await expect(createMarketingMessage({ workspace, input })).rejects.toThrow(
      "upload failed",
    )
    expect(createMessageCampaign).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  test("refuses an ad account that has not accepted the custom audience terms", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValueOnce([
      { id: "act_123", accountId: "123", currency: "USD", tosAccepted: {} },
    ])

    await expect(createMarketingMessage({ workspace, input })).rejects.toThrow(
      TOS_URL_PATTERN,
    )
    expect(createMessageCampaign).not.toHaveBeenCalled()
  })

  test("refuses an ad account the grant cannot see", async () => {
    getMarketingMessagesAdAccounts.mockResolvedValueOnce([])

    await expect(createMarketingMessage({ workspace, input })).rejects.toThrow()
    expect(createMessageCampaign).not.toHaveBeenCalled()
  })
})
