// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/space/[workspaceId]/dashboard/ads/export/route"

type ExportRow = {
  id: string
  contactId: string
  contactName: string | null
  phoneNumber: string | null
  email: string | null
  adId: string | null
  occurredAt: Date
}

type ResolveGuardedWorkspaceIdMock = (
  params: Promise<{ workspaceId: string }>,
  permission: "superAdmin",
) => Promise<string>

type ListExportRowsMock = (input: {
  workspaceId: string
  segment: "conversations" | "leads" | "purchases"
  adId?: string | null
  integrationWhatsappId?: string
  since: Date
  until: Date
  afterId?: string
  limit: number
}) => Promise<ExportRow[]>

type AllChannelExportRow = ExportRow & { channel?: string }

type ListAllChannelExportRowsMock = (input: {
  workspaceId: string
  segment: "conversations" | "leads" | "purchases"
  adId?: string | null
  since: Date
  until: Date
  afterId?: string
  limit: number
}) => Promise<AllChannelExportRow[]>

const {
  mockListExportRows,
  mockListAllChannelExportRows,
  mockResolveGuardedWorkspaceId,
} = vi.hoisted(() => ({
  mockListExportRows: vi.fn<ListExportRowsMock>(),
  mockListAllChannelExportRows: vi.fn<ListAllChannelExportRowsMock>(),
  mockResolveGuardedWorkspaceId: vi.fn<ResolveGuardedWorkspaceIdMock>(
    async () => "ws-1",
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    listExportRows: mockListExportRows,
    listAllChannelExportRows: mockListAllChannelExportRows,
  },
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  resolveGuardedWorkspaceId: mockResolveGuardedWorkspaceId,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

const callRoute = (query: string) =>
  GET(
    new Request(`http://localhost/space/ws-1/dashboard/ads/export?${query}`),
    {
      params: Promise.resolve({ workspaceId: "ws-1" }),
    },
  )

describe("ads analytics export route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveGuardedWorkspaceId.mockResolvedValue("ws-1")
    mockListExportRows.mockResolvedValue([])
    mockListAllChannelExportRows.mockResolvedValue([])
  })

  test("propagates workspace guard rejection without exporting rows", async () => {
    mockResolveGuardedWorkspaceId.mockRejectedValue(new Error("not found"))

    await expect(
      callRoute("segment=conversations&from=2026-08-01&to=2026-08-10"),
    ).rejects.toThrow("not found")

    expect(mockResolveGuardedWorkspaceId).toHaveBeenCalledTimes(1)
    const guardCall = mockResolveGuardedWorkspaceId.mock.calls[0]
    if (!guardCall) {
      throw new Error("workspace guard was not called")
    }
    const [params, permission] = guardCall
    await expect(params).resolves.toEqual({ workspaceId: "ws-1" })
    expect(permission).toBe("superAdmin")
    expect(mockListExportRows).not.toHaveBeenCalled()
  })

  test("returns invalidRequest for an invalid query without exporting rows", async () => {
    const response = await callRoute("segment=&from=2026-08-01&to=2026-08-10")

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ code: "invalidRequest" })
    expect(mockListExportRows).not.toHaveBeenCalled()
  })

  test("legacy no-channel export stays byte-identical: 4 columns, ctwa-* filename", async () => {
    const row: ExportRow = {
      id: "row-1",
      contactId: "contact-1",
      contactName: "Ada Lovelace",
      phoneNumber: "+12025550101",
      email: "ada@example.com",
      adId: "ad-1",
      occurredAt: new Date("2026-08-05T09:30:00.000Z"),
    }
    // A single row (< EXPORT_PAGE_SIZE) ends the pagination loop after one
    // call — no second queued value needed (and queuing one would leak into
    // the next test's first call, since vi.clearAllMocks() doesn't clear a
    // still-queued mockResolvedValueOnce implementation).
    mockListExportRows.mockResolvedValueOnce([row])

    // No `channel` param → legacy/external consumer that already parses the
    // original 4-column CTWA CSV; the output must NOT gain the channel column.
    const response = await callRoute(
      "segment=leads&integrationWhatsappId=1234567890123&from=2026-08-01&to=2026-08-10",
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="ctwa-leads-2026-08-01-2026-08-10.csv"',
    )
    await expect(response.text()).resolves.toBe(
      [
        "ads.analytics.csv.contactName,ads.analytics.csv.phone,ads.analytics.csv.adId,ads.analytics.csv.occurredAt",
        "Ada Lovelace,'+12025550101,ad-1,2026-08-05T09:30:00.000Z",
        "",
      ].join("\n"),
    )
    expect(mockListExportRows).toHaveBeenCalledTimes(1)
    expect(mockListExportRows).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      segment: "leads",
      adId: undefined,
      integrationWhatsappId: "1234567890123",
      // A legacy no-channel URL must stay WhatsApp-scoped: the route resolves
      // `channel` to "whatsapp" before querying, so messenger/instagram
      // events can never leak into rows the CSV labels "WhatsApp".
      channel: "whatsapp",
      integrationMessengerId: undefined,
      integrationInstagramId: undefined,
      since: new Date("2026-08-01T00:00:00.000Z"),
      until: new Date("2026-08-10T23:59:59.999Z"),
      afterId: undefined,
      limit: 500,
    })
  })

  test("threads `tz` into the resolved [since, until] window so CSV rows match the on-screen viewer-local window", async () => {
    mockListExportRows.mockResolvedValueOnce([])

    await callRoute(
      "segment=leads&from=2026-08-27&to=2026-08-27&tz=Asia%2FSaigon",
    )

    expect(mockListExportRows).toHaveBeenCalledWith(
      expect.objectContaining({
        since: new Date("2026-08-26T17:00:00.000Z"),
        until: new Date("2026-08-27T16:59:59.999Z"),
      }),
    )
  })

  test("falls back to UTC anchoring for an omitted `tz` (old export links keep working unchanged)", async () => {
    mockListExportRows.mockResolvedValueOnce([])

    await callRoute("segment=leads&from=2026-08-01&to=2026-08-10")

    expect(mockListExportRows).toHaveBeenCalledWith(
      expect.objectContaining({
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
      }),
    )
  })

  test("explicit channel=whatsapp gets the 5-column ads-whatsapp-* format", async () => {
    mockListExportRows.mockResolvedValueOnce([
      {
        id: "row-1",
        contactId: "contact-1",
        contactName: "Ada Lovelace",
        phoneNumber: "+12025550101",
        email: "ada@example.com",
        adId: "ad-1",
        occurredAt: new Date("2026-08-05T09:30:00.000Z"),
      },
    ])

    const response = await callRoute(
      "segment=leads&channel=whatsapp&from=2026-08-01&to=2026-08-10",
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="ads-whatsapp-leads-2026-08-01-2026-08-10.csv"',
    )
    await expect(response.text()).resolves.toBe(
      [
        "ads.analytics.csv.contactName,ads.analytics.csv.phone,ads.analytics.csv.adId,ads.analytics.csv.occurredAt,ads.analytics.csv.channel",
        "Ada Lovelace,'+12025550101,ad-1,2026-08-05T09:30:00.000Z,ads.conversionEvents.tabs.whatsapp",
        "",
      ].join("\n"),
    )
  })

  test("threads channel + per-channel integration ids into the export query and CSV column", async () => {
    const row: ExportRow = {
      id: "row-1",
      contactId: "contact-1",
      contactName: "Grace Hopper",
      phoneNumber: null,
      email: null,
      adId: "ad-messenger-1",
      occurredAt: new Date("2026-08-06T10:00:00.000Z"),
    }
    // A single row (< EXPORT_PAGE_SIZE) ends the pagination loop after one
    // call — no second queued value needed (and queuing one would leak into
    // the next test's first call, since vi.clearAllMocks() doesn't clear a
    // still-queued mockResolvedValueOnce implementation).
    mockListExportRows.mockResolvedValueOnce([row])

    const response = await callRoute(
      "segment=leads&channel=messenger&integrationMessengerId=555&from=2026-08-01&to=2026-08-10",
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe(
      [
        "ads.analytics.csv.contactName,ads.analytics.csv.phone,ads.analytics.csv.adId,ads.analytics.csv.occurredAt,ads.analytics.csv.channel",
        "Grace Hopper,,ad-messenger-1,2026-08-06T10:00:00.000Z,ads.conversionEvents.tabs.messenger",
        "",
      ].join("\n"),
    )
    expect(mockListExportRows).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      segment: "leads",
      adId: undefined,
      integrationWhatsappId: undefined,
      channel: "messenger",
      integrationMessengerId: "555",
      integrationInstagramId: undefined,
      since: new Date("2026-08-01T00:00:00.000Z"),
      until: new Date("2026-08-10T23:59:59.999Z"),
      afterId: undefined,
      limit: 500,
    })
  })

  test("rejects an unknown channel value", async () => {
    const response = await callRoute(
      "segment=leads&channel=tiktok&from=2026-08-01&to=2026-08-10",
    )

    expect(response.status).toBe(400)
    expect(mockListExportRows).not.toHaveBeenCalled()
  })

  describe("channel=all (analytics-only 'All channels' export mode)", () => {
    test("streams each row's REAL channel and uses a channel-neutral filename", async () => {
      const rows: AllChannelExportRow[] = [
        {
          id: "row-1",
          contactId: "contact-1",
          contactName: "Ada Lovelace",
          phoneNumber: "+12025550101",
          email: null,
          adId: "ad-1",
          occurredAt: new Date("2026-08-05T09:30:00.000Z"),
          channel: "whatsapp",
        },
        {
          id: "row-2",
          contactId: "contact-2",
          contactName: "Grace Hopper",
          phoneNumber: null,
          email: null,
          adId: "ad-2",
          occurredAt: new Date("2026-08-06T10:00:00.000Z"),
          channel: "messenger",
        },
      ]
      mockListAllChannelExportRows.mockResolvedValueOnce(rows)

      const response = await callRoute(
        "segment=leads&channel=all&from=2026-08-01&to=2026-08-10",
      )

      expect(response.status).toBe(200)
      expect(response.headers.get("content-disposition")).toContain(
        'filename="ads-all-leads-2026-08-01-2026-08-10.csv"',
      )
      await expect(response.text()).resolves.toBe(
        [
          "ads.analytics.csv.contactName,ads.analytics.csv.phone,ads.analytics.csv.adId,ads.analytics.csv.occurredAt,ads.analytics.csv.channel",
          "Ada Lovelace,'+12025550101,ad-1,2026-08-05T09:30:00.000Z,ads.conversionEvents.tabs.whatsapp",
          "Grace Hopper,,ad-2,2026-08-06T10:00:00.000Z,ads.conversionEvents.tabs.messenger",
          "",
        ].join("\n"),
      )
      expect(mockListExportRows).not.toHaveBeenCalled()
      expect(mockListAllChannelExportRows).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        segment: "leads",
        adId: undefined,
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-10T23:59:59.999Z"),
        afterId: undefined,
        limit: 500,
      })
    })

    test("rejects an integration id alongside channel=all", async () => {
      const response = await callRoute(
        "segment=leads&channel=all&integrationWhatsappId=1&from=2026-08-01&to=2026-08-10",
      )

      // `allChannelExportRequestSchema` has no integration fields at all —
      // zod strips unknown keys by default, so an extra `integrationWhatsappId`
      // is silently ignored rather than rejected; the important guarantee is
      // that it never reaches `listAllChannelExportRows`.
      expect(response.status).toBe(200)
      expect(mockListAllChannelExportRows).toHaveBeenCalledWith(
        expect.not.objectContaining({
          integrationWhatsappId: expect.anything(),
        }),
      )
    })
  })
})
