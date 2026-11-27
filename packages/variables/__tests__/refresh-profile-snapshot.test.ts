import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { beforeEach, expect, test, vi } from "vitest"

const {
  mockFindWithIntegrationsById,
  mockInvalidateCacheKeys,
  mockRefreshProfileSnapshot,
  mockResolveIntegrationContext,
  mockRunChannelHandler,
} = vi.hoisted(() => ({
  mockFindWithIntegrationsById: vi.fn(),
  mockInvalidateCacheKeys: vi.fn(async () => undefined),
  mockRefreshProfileSnapshot: vi.fn(async () => undefined),
  mockResolveIntegrationContext: vi.fn(),
  mockRunChannelHandler: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { refreshProfileSnapshot: mockRefreshProfileSnapshot },
  inboxService: { findWithIntegrationsById: mockFindWithIntegrationsById },
  resolveTenantSettings: vi.fn(),
  resolveWorkspaceAppUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/business/contact-locale", () => ({
  normalizeStoredTimezone: (value: string) => value,
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  systemFieldService: { create: vi.fn() },
}))

vi.mock("@chatbotx.io/encryption/link-signature", () => ({
  signMeLink: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getPostDetails: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  getPostDetails: vi.fn(),
  getUserInboxLink: vi.fn(),
}))

vi.mock("@chatbotx.io/channel-registry/registry", () => ({
  resolveIntegrationContextFromContactInbox: mockResolveIntegrationContext,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheKeys: mockInvalidateCacheKeys,
  withCache: vi.fn((_key: string, resolve: () => Promise<unknown>) =>
    resolve(),
  ),
}))

const { refreshContactProfileSnapshot } = await import(
  "../src/helpers/integration-fields"
)

const buildContactInbox = (channel: string) =>
  ({
    id: "contact-inbox-1",
    channel,
    inboxId: "inbox-1",
    sourceId: "source-1",
  }) as ContactInboxModel

const freshSnapshot = {
  followsBusiness: true,
  businessFollowsContact: false,
  accountVerified: false,
  followerCount: 42,
  username: "player",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindWithIntegrationsById.mockResolvedValue({
    id: "inbox-1",
    workspaceId: "workspace-1",
    integrationInstagram: { id: "integration-1" },
  })
  mockRunChannelHandler.mockResolvedValue(freshSnapshot)
  mockResolveIntegrationContext.mockResolvedValue({
    integration: { runChannelHandler: mockRunChannelHandler },
    ctx: {},
  })
})

test("drops the cached snapshot, fetches live and persists it", async () => {
  await refreshContactProfileSnapshot({
    contactInbox: buildContactInbox("instagram"),
    workspaceId: "workspace-1",
  })

  expect(mockInvalidateCacheKeys).toHaveBeenCalledWith(
    "profile-snapshot:contact-inbox-1",
  )
  expect(mockRunChannelHandler).toHaveBeenCalledWith(
    "contact",
    "getProfileSnapshot",
    { ctx: {}, data: { sourceId: "source-1" } },
  )
  const [invalidateOrder] = mockInvalidateCacheKeys.mock.invocationCallOrder
  const [fetchOrder] = mockRunChannelHandler.mock.invocationCallOrder
  expect(invalidateOrder).toBeLessThan(fetchOrder as number)
  expect(mockRefreshProfileSnapshot).toHaveBeenCalledWith({
    contactInboxId: "contact-inbox-1",
    inboxId: "inbox-1",
    snapshot: freshSnapshot,
  })
})

test("skips channels without a profile snapshot", async () => {
  await refreshContactProfileSnapshot({
    contactInbox: buildContactInbox("messenger"),
    workspaceId: "workspace-1",
  })

  expect(mockInvalidateCacheKeys).not.toHaveBeenCalled()
  expect(mockRunChannelHandler).not.toHaveBeenCalled()
  expect(mockRefreshProfileSnapshot).not.toHaveBeenCalled()
})

test("never throws when the live fetch fails", async () => {
  mockRunChannelHandler.mockRejectedValue(new Error("rate limited"))

  await expect(
    refreshContactProfileSnapshot({
      contactInbox: buildContactInbox("instagram"),
      workspaceId: "workspace-1",
    }),
  ).resolves.toBeUndefined()
  expect(mockRefreshProfileSnapshot).not.toHaveBeenCalled()
})

test("still fetches live when the cache invalidation fails", async () => {
  mockInvalidateCacheKeys.mockRejectedValueOnce(new Error("redis down"))

  await refreshContactProfileSnapshot({
    contactInbox: buildContactInbox("instagram"),
    workspaceId: "workspace-1",
  })

  expect(mockRefreshProfileSnapshot).toHaveBeenCalledTimes(1)
})

test("never throws when the inbox lookup fails", async () => {
  mockFindWithIntegrationsById.mockRejectedValueOnce(new Error("db down"))

  await expect(
    refreshContactProfileSnapshot({
      contactInbox: buildContactInbox("instagram"),
      workspaceId: "workspace-1",
    }),
  ).resolves.toBeUndefined()
})
