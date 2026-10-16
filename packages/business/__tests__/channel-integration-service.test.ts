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
        handoverResumeFlowId: "77",
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
        handoverResumeFlowId: "77",
        adsEligible: true,
      }),
    ])
  })

  test("instagram is ads eligible only for Facebook-login accounts", async () => {
    const base = {
      inboxId: "2",
      igId: "ig",
      username: null,
      coexistEnabled: false,
      hasCapiScope: false,
      datasetId: null,
      capiTestEventCode: null,
      capiDisconnectedAt: null,
      tokenRefreshError: null,
    }
    queryModels.integrationInstagramModel.findMany.mockResolvedValue([
      { ...base, id: "1", name: "Facebook login", type: "facebook" },
      { ...base, id: "2", name: "Native login", type: "instagram" },
    ])

    const rows = await channelIntegrationService.list({
      workspaceId: "ws-1",
      channel: "instagram",
    })

    expect(rows.map((row) => [row.id, row.adsEligible])).toEqual([
      ["1", true],
      ["2", false],
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

  describe("capiConnected", () => {
    const capiRow = {
      inboxId: "2",
      coexistEnabled: false,
      hasCapiScope: false,
      hasCapiAccessToken: false,
      datasetId: null,
      capiTestEventCode: null,
      capiDisconnectedAt: null,
      tokenRefreshError: null,
    }

    test("derives token presence in SQL instead of selecting the encrypted token", async () => {
      await channelIntegrationService.list({ workspaceId: "ws-1" })

      for (const model of [
        queryModels.integrationWhatsappModel,
        queryModels.integrationMessengerModel,
        queryModels.integrationInstagramModel,
      ]) {
        const [{ columns, extras }] = model.findMany.mock
          .calls[0] as unknown as [
          {
            columns: Record<string, boolean>
            extras: Record<string, unknown>
          },
        ]
        expect(columns.capiAccessToken).toBeUndefined()
        expect(extras.hasCapiAccessToken).toEqual(expect.any(Function))
      }
    })

    test("a messenger row with a dedicated token and a dataset is connected", async () => {
      queryModels.integrationMessengerModel.findMany.mockResolvedValue([
        {
          ...capiRow,
          id: "1",
          name: "Page",
          pageId: "p",
          syncTagEnabledAt: null,
          handoverResumeFlowId: null,
          hasCapiAccessToken: true,
          datasetId: "ds-1",
        },
      ])

      const [row] = await channelIntegrationService.list({
        workspaceId: "ws-1",
        channel: "messenger",
      })

      expect(row.capiConnected).toBe(true)
      expect(row).not.toHaveProperty("hasCapiAccessToken")
    })

    test("a legacy messenger row is connected on its stored scope and dataset", async () => {
      queryModels.integrationMessengerModel.findMany.mockResolvedValue([
        {
          ...capiRow,
          id: "1",
          name: "Page",
          pageId: "p",
          syncTagEnabledAt: null,
          handoverResumeFlowId: null,
          hasCapiScope: true,
          datasetId: "ds-1",
        },
        {
          ...capiRow,
          id: "2",
          name: "Page without the scope",
          pageId: "p2",
          syncTagEnabledAt: null,
          handoverResumeFlowId: null,
          datasetId: "ds-2",
        },
      ])

      const rows = await channelIntegrationService.list({
        workspaceId: "ws-1",
        channel: "messenger",
      })

      expect(rows.map((row) => [row.id, row.capiConnected])).toEqual([
        ["1", true],
        ["2", false],
      ])
    })

    test("a whatsapp row with only a dataset is connected: the channel is exempt from the scope", async () => {
      queryModels.integrationWhatsappModel.findMany.mockResolvedValue([
        {
          ...capiRow,
          id: "1",
          name: "Shop",
          phoneNumberId: "pn-1",
          wabaId: "waba-1",
          displayPhoneNumber: "",
          isCoexist: false,
          handoverResumeFlowId: null,
          datasetId: "ds-1",
        },
      ])

      const [row] = await channelIntegrationService.list({
        workspaceId: "ws-1",
        channel: "whatsapp",
      })

      expect(row.capiConnected).toBe(true)
    })

    test("a user disconnect reads as not connected even with a token and a dataset", async () => {
      queryModels.integrationInstagramModel.findMany.mockResolvedValue([
        {
          ...capiRow,
          id: "1",
          name: "IG",
          igId: "ig",
          type: "facebook",
          username: null,
          hasCapiAccessToken: true,
          datasetId: "ds-1",
          capiDisconnectedAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      ])

      const [row] = await channelIntegrationService.list({
        workspaceId: "ws-1",
        channel: "instagram",
      })

      expect(row.capiConnected).toBe(false)
      expect(row.capiDisconnected).toBe(true)
    })

    test("channels without a Conversions API are never connected", async () => {
      queryModels.integrationZaloModel.findMany.mockResolvedValue([
        {
          id: "1",
          inboxId: "2",
          name: "OA",
          oaId: "oa",
          syncTagEnabledAt: null,
          tokenRefreshError: null,
        },
      ])

      const [row] = await channelIntegrationService.list({
        workspaceId: "ws-1",
        channel: "zalo",
      })

      expect(row.capiConnected).toBe(false)
    })
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
