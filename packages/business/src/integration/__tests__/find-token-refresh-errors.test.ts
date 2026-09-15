import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock("../../connection/state-service", () => ({
  connectionStateService: { list: mocks.list },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {},
  eq: vi.fn(),
  exists: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMetaCatalogModel: {},
  integrationModel: {},
}))

const { integrationService } = await import("../service")

const connection = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "conn-1",
  provider: "messenger",
  displayName: "My Page",
  lastError: "refresh failed",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("integrationService.findTokenRefreshErrorsByWorkspaceId", () => {
  it("queries connectionStateService.list scoped to channel connections in needs_reauth/degraded", async () => {
    mocks.list.mockResolvedValue({ data: [] })
    await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")
    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      kind: "channel",
      status: ["needs_reauth", "degraded"],
    })
  })

  it("maps a matching auto-refresh channel connection onto the legacy DTO", async () => {
    mocks.list.mockResolvedValue({ data: [connection()] })
    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")
    expect(result).toEqual([
      {
        id: "conn-1",
        channel: "messenger",
        name: "My Page",
        error: "refresh failed",
      },
    ])
  })

  it("preserves the instagram vs instagramFacebook provider distinction", async () => {
    mocks.list.mockResolvedValue({
      data: [connection({ id: "conn-2", provider: "instagramFacebook" })],
    })
    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")
    expect(result).toEqual([
      expect.objectContaining({ channel: "instagramFacebook" }),
    ])
  })

  it("excludes a connection whose provider does not auto-refresh (e.g. smtp)", async () => {
    mocks.list.mockResolvedValue({
      data: [connection({ provider: "smtp" })],
    })
    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")
    expect(result).toEqual([])
  })

  it("excludes a connection with no lastError", async () => {
    mocks.list.mockResolvedValue({
      data: [connection({ lastError: null })],
    })
    const result =
      await integrationService.findTokenRefreshErrorsByWorkspaceId("ws-1")
    expect(result).toEqual([])
  })
})
