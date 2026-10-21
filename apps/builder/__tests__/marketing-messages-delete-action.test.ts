import { beforeEach, describe, expect, test, vi } from "vitest"

const calls: string[] = []
const find = vi.fn()
const remove = vi.fn(() => {
  calls.push("dbRemove")
  return Promise.resolve()
})
const resolveGrantToken = vi.fn()
const deleteMessageCampaign = vi.fn(() => {
  calls.push("metaDelete")
  return Promise.resolve()
})

class ChatbotXException extends Error {
  code: string
  constructor(message: string, code = "systemError") {
    super(message)
    this.code = code
  }
}
class FacebookAdsException extends Error {
  code?: number
  subCode?: number
}

vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessagesService: { find, remove },
  facebookMarketingMessageDeliveryService: { resolveGrantToken },
}))
vi.mock("@chatbotx.io/business/errors", () => ({ ChatbotXException }))
vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  deleteMessageCampaign,
  FacebookAdsException,
}))
vi.mock("@/features/facebook-marketing-messages/lib/grant", () => ({
  requireValidGrant: vi.fn(),
}))
vi.mock("@/features/facebook-marketing-messages/lib/media-attachment", () => ({
  resolveContentAttachments: vi.fn(),
}))
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))

const { deleteMarketingMessages } = await import(
  "@/features/facebook-marketing-messages/lib/campaign-operations"
)

const workspace = { id: "w1" } as never
const row = (id: string) => ({ id, workspaceId: "w1", campaignId: `c-${id}` })

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  find.mockImplementation(({ id }: { id: string }) => Promise.resolve(row(id)))
  resolveGrantToken.mockResolvedValue({ accessToken: "TOKEN" })
})

describe("deleteMarketingMessages", () => {
  test("campaigns.delete deletes the Meta campaign before the row", async () => {
    await deleteMarketingMessages({ workspace, ids: ["1"] })

    expect(calls).toEqual(["metaDelete", "dbRemove"])
    expect(deleteMessageCampaign).toHaveBeenCalledWith({
      accessToken: "TOKEN",
      campaignId: "c-1",
    })
    expect(remove).toHaveBeenCalledWith({ workspaceId: "w1", ids: ["1"] })
  })

  test("keeps the row when Meta fails, with a translated error", async () => {
    deleteMessageCampaign.mockRejectedValueOnce(new Error("Meta down"))

    const error = await deleteMarketingMessages({
      workspace,
      ids: ["1"],
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ChatbotXException)
    expect(error).toMatchObject({
      code: "mmMetaDeleteFailed",
      message: "facebookMarketingMessages.errors.metaDeleteFailed",
    })
    expect(remove).not.toHaveBeenCalled()
  })

  test("treats Meta's object-does-not-exist (100/33) as deleted", async () => {
    const gone = new FacebookAdsException("gone")
    gone.code = 100
    gone.subCode = 33
    deleteMessageCampaign.mockRejectedValueOnce(gone)

    await deleteMarketingMessages({ workspace, ids: ["1"] })

    expect(remove).toHaveBeenCalledWith({ workspaceId: "w1", ids: ["1"] })
  })

  test("refuses an id without a grant and never deletes our row alone", async () => {
    resolveGrantToken.mockResolvedValue(null)

    await expect(
      deleteMarketingMessages({ workspace, ids: ["1"] }),
    ).rejects.toMatchObject({ code: "mmGrantInvalid" })
    expect(deleteMessageCampaign).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  test("a Meta error aborts that id and the ones after it, keeping earlier deletes", async () => {
    deleteMessageCampaign
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Meta down"))

    await expect(
      deleteMarketingMessages({ workspace, ids: ["1", "2", "3"] }),
    ).rejects.toMatchObject({ code: "mmMetaDeleteFailed" })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith({ workspaceId: "w1", ids: ["1"] })
  })
})
