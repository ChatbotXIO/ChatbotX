import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const tableData = vi.hoisted(
  () =>
    new Map<string, Row[]>([
      ["zalo", []],
      ["tiktok", []],
      ["instagram", []],
      ["messenger", []],
      ["whatsapp", []],
      ["threads", []],
    ]),
)

const setRows = (channel: string, rows: Row[]) => {
  tableData.set(channel, rows)
}

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => args,
  eq: vi.fn(),
  exists: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  db: {
    // The mocked tables below carry a `__channel` tag the real schema
    // columns don't have — used only here to route `.from(table)` to the
    // right in-memory rows, independent of the (unvalidated) `select`/
    // `where` shape the real implementation builds.
    select: () => ({
      from: (table: { __channel: string }) => ({
        where: () => Promise.resolve(tableData.get(table.__channel) ?? []),
      }),
    }),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationZaloModel: {
    __channel: "zalo",
    id: "id",
    name: "name",
    workspaceId: "workspaceId",
    tokenRefreshError: "tokenRefreshError",
  },
  integrationTiktokModel: {
    __channel: "tiktok",
    id: "id",
    name: "name",
    workspaceId: "workspaceId",
    tokenRefreshError: "tokenRefreshError",
  },
  integrationInstagramModel: {
    __channel: "instagram",
    id: "id",
    name: "name",
    workspaceId: "workspaceId",
    tokenRefreshError: "tokenRefreshError",
    type: "type",
  },
  integrationMessengerModel: {
    __channel: "messenger",
    id: "id",
    name: "name",
    workspaceId: "workspaceId",
    tokenRefreshError: "tokenRefreshError",
  },
  integrationWhatsappModel: {
    __channel: "whatsapp",
    id: "id",
    name: "name",
    workspaceId: "workspaceId",
    tokenRefreshError: "tokenRefreshError",
  },
  integrationThreadsModel: {
    __channel: "threads",
    id: "id",
    name: "name",
    workspaceId: "workspaceId",
    tokenRefreshError: "tokenRefreshError",
  },
  integrationMetaCatalogModel: {},
  integrationModel: {},
}))

const { integrationService } = await import("../service")

beforeEach(() => {
  vi.clearAllMocks()
  for (const channel of tableData.keys()) {
    setRows(channel, [])
  }
})

describe("integrationService.findTokenRefreshErrorsByWorkspaceId", () => {
  it("reads the channel's own tokenRefreshError column — the field the refresh crons actually write (regression: Connection.lastError is never set by the crons and was always empty)", async () => {
    setRows("messenger", [
      { id: "int-1", name: "My Page", error: "refresh failed" },
    ])

    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")

    expect(result).toEqual([
      {
        id: "int-1",
        channel: "messenger",
        name: "My Page",
        error: "refresh failed",
      },
    ])
  })

  it("returns the channel's own Integration<Channel>.id, not a Connection id (regression: the public API contract)", async () => {
    setRows("zalo", [
      { id: "integration-zalo-1", name: "Shop", error: "expired" },
    ])

    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")

    expect(result).toEqual([
      {
        id: "integration-zalo-1",
        channel: "zalo",
        name: "Shop",
        error: "expired",
      },
    ])
  })

  it("maps IntegrationInstagram.type to the instagram vs instagramFacebook channel", async () => {
    setRows("instagram", [
      { id: "ig-1", name: "IG", error: "expired", type: "instagram" },
      { id: "ig-2", name: "FB IG", error: "expired", type: "facebook" },
    ])

    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")

    expect(result).toEqual([
      expect.objectContaining({ id: "ig-1", channel: "instagram" }),
      expect.objectContaining({ id: "ig-2", channel: "instagramFacebook" }),
    ])
  })

  it("returns an empty list when no satellite row has a tokenRefreshError", async () => {
    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")
    expect(result).toEqual([])
  })

  it("aggregates across every auto-refresh channel", async () => {
    setRows("zalo", [{ id: "z-1", name: "Z", error: "e1" }])
    setRows("tiktok", [{ id: "t-1", name: "T", error: "e2" }])
    setRows("whatsapp", [{ id: "w-1", name: "W", error: "e3" }])
    setRows("threads", [{ id: "th-1", name: "TH", error: "e4" }])

    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")

    expect(result.map((row) => row.channel).sort()).toEqual(
      ["threads", "tiktok", "whatsapp", "zalo"].sort(),
    )
  })
})
