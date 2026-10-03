// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const queryModels = vi.hoisted(() => {
  const make = () => ({ findMany: vi.fn(async () => [] as unknown[]) })
  return {
    integrationWhatsappModel: make(),
    integrationMessengerModel: make(),
    integrationInstagramModel: make(),
    integrationZaloModel: make(),
    integrationTiktokModel: make(),
  }
})
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: queryModels },
}))

const { channelIntegrationService } = await import(
  "../src/channel-integration/service"
)

const SECRET_COLUMNS = ["auth", "capiAccessToken", "userInfo"]

beforeEach(() => {
  for (const model of Object.values(queryModels)) {
    model.findMany.mockReset().mockResolvedValue([])
  }
})

describe("channelIntegrationService", () => {
  test("list without a channel queries all five tables, scoped to the workspace", async () => {
    await channelIntegrationService.list({ workspaceId: "ws-1" })

    for (const model of Object.values(queryModels)) {
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: "ws-1" } }),
      )
    }
  })

  test("list with a channel queries only that table", async () => {
    await channelIntegrationService.list({
      workspaceId: "ws-1",
      channel: "zalo",
    })

    expect(queryModels.integrationZaloModel.findMany).toHaveBeenCalledTimes(1)
    expect(
      queryModels.integrationMessengerModel.findMany,
    ).not.toHaveBeenCalled()
  })

  test("never selects credential columns", async () => {
    await channelIntegrationService.list({ workspaceId: "ws-1" })

    for (const model of Object.values(queryModels)) {
      const [{ columns }] = model.findMany.mock.calls[0] as unknown as [
        { columns: Record<string, boolean> },
      ]
      for (const secret of SECRET_COLUMNS) {
        expect(columns[secret]).toBeUndefined()
      }
    }
  })

  test("maps a WhatsApp row and flags ads eligibility", async () => {
    queryModels.integrationWhatsappModel.findMany.mockResolvedValue([
      {
        id: "1",
        inboxId: "9",
        name: "Shop",
        phoneNumberId: "pn-1",
        wabaId: "waba-1",
        displayPhoneNumber: "",
        coexistEnabled: false,
        isCoexist: true,
        hasCapiScope: true,
        datasetId: "ds-1",
        tokenRefreshError: null,
      },
    ])

    const rows = await channelIntegrationService.list({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })

    expect(rows).toEqual([
      expect.objectContaining({
        id: "1",
        channel: "whatsapp",
        externalId: "pn-1",
        wabaId: "waba-1",
        displayPhoneNumber: null,
        isCoexist: true,
        adsEligible: true,
      }),
    ])
  })

  test("zalo and tiktok are not ads eligible", async () => {
    queryModels.integrationZaloModel.findMany.mockResolvedValue([
      {
        id: "1",
        inboxId: "2",
        name: "OA",
        oaId: "oa",
        syncTagEnabledAt: null,
        tokenRefreshError: "expired",
      },
    ])

    const [row] = await channelIntegrationService.list({
      workspaceId: "ws-1",
      channel: "zalo",
    })

    expect(row.adsEligible).toBe(false)
    expect(row.tokenRefreshError).toBe("expired")
  })

  test("get scopes by workspace and id, and throws when absent", async () => {
    await expect(
      channelIntegrationService.get({
        workspaceId: "ws-1",
        channel: "messenger",
        id: "404",
      }),
    ).rejects.toThrow("Channel integration not found")

    expect(queryModels.integrationMessengerModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-1", id: "404" } }),
    )
  })
})
