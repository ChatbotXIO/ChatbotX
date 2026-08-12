// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/space/[workspaceId]/ads/analytics/export/route"

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

const { mockListExportRows, mockResolveGuardedWorkspaceId } = vi.hoisted(
  () => ({
    mockListExportRows: vi.fn<ListExportRowsMock>(),
    mockResolveGuardedWorkspaceId: vi.fn<ResolveGuardedWorkspaceIdMock>(
      async () => "ws-1",
    ),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    listExportRows: mockListExportRows,
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
    new Request(`http://localhost/space/ws-1/ads/analytics/export?${query}`),
    {
      params: Promise.resolve({ workspaceId: "ws-1" }),
    },
  )

describe("ads analytics export route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveGuardedWorkspaceId.mockResolvedValue("ws-1")
    mockListExportRows.mockResolvedValue([])
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

  test("streams CSV and threads integrationWhatsappId into the export query", async () => {
    const row: ExportRow = {
      id: "row-1",
      contactId: "contact-1",
      contactName: "Ada Lovelace",
      phoneNumber: "+12025550101",
      email: "ada@example.com",
      adId: "ad-1",
      occurredAt: new Date("2026-08-05T09:30:00.000Z"),
    }
    mockListExportRows.mockResolvedValueOnce([row]).mockResolvedValueOnce([])

    const response = await callRoute(
      "segment=leads&integrationWhatsappId=1234567890123&from=2026-08-01&to=2026-08-10",
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8")
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
      since: new Date("2026-08-01T00:00:00.000Z"),
      until: new Date("2026-08-10T23:59:59.999Z"),
      afterId: undefined,
      limit: 500,
    })
  })
})
