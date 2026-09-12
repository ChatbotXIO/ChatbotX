// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpdate, mockReturning, mockInvalidateCacheByTags } = vi.hoisted(
  () => {
    const mockReturning = vi.fn()
    const mockWhere = vi.fn(() => ({ returning: mockReturning }))
    const mockSet = vi.fn(() => ({ where: mockWhere }))
    const mockUpdate = vi.fn(() => ({ set: mockSet }))
    return {
      mockUpdate,
      mockReturning,
      mockInvalidateCacheByTags: vi.fn(async () => undefined),
    }
  },
)

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: { update: mockUpdate },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT: "IntegrationMessenger_pageId_key",
  integrationMessengerModel: {
    id: "id",
    workspaceId: "workspaceId",
    syncTagEnabledAt: "syncTagEnabledAt",
  },
  integrationZaloModel: {
    id: "id",
    workspaceId: "workspaceId",
    syncTagEnabledAt: "syncTagEnabledAt",
  },
  tagChannelModel: {
    channelType: "channelType",
    integrationId: "integrationId",
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger", zalo: "zalo" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/inbox/connect-channel", () => ({
  auditChannelConnected: vi.fn(),
  connectChannelIntegration: vi.fn(),
  runConnectTransaction: vi.fn(),
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: vi.fn() },
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {},
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueChannelScan: vi.fn() },
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const { messengerIntegrationService } = await import(
  "../src/integration-messenger/service"
)
const { zaloIntegrationService } = await import(
  "../src/integration-zalo/service"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("messengerIntegrationService.updateTagSync", () => {
  test("throws notFound and skips cache invalidation when no row matches", async () => {
    mockReturning.mockResolvedValueOnce([])

    await expect(
      messengerIntegrationService.updateTagSync({
        workspaceId: "ws-1",
        integrationId: "int-1",
        enabled: true,
      }),
    ).rejects.toThrow("Messenger channel not found")

    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("invalidates the workspace-scoped messenger cache tag on success", async () => {
    const now = new Date()
    mockReturning.mockResolvedValueOnce([{ syncTagEnabledAt: now }])

    const result = await messengerIntegrationService.updateTagSync({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: true,
    })

    expect(result).toBe(now)
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-1#messengers",
    ])
  })
})

describe("zaloIntegrationService.updateTagSync", () => {
  test("throws notFound and skips cache invalidation when no row matches", async () => {
    mockReturning.mockResolvedValueOnce([])

    await expect(
      zaloIntegrationService.updateTagSync({
        workspaceId: "ws-1",
        integrationId: "int-1",
        enabled: true,
      }),
    ).rejects.toThrow("Zalo channel not found")

    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("invalidates the workspace-scoped zalo cache tag on success", async () => {
    mockReturning.mockResolvedValueOnce([{ syncTagEnabledAt: null }])

    const result = await zaloIntegrationService.updateTagSync({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: false,
    })

    expect(result).toBeNull()
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-1#zalos",
    ])
  })
})
