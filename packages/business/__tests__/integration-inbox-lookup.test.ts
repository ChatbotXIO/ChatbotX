import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// zaloIntegrationService.findByInboxIdForWorkspace /
// telegramIntegrationService.findByInboxIdForWorkspace — both new lookups
// added for the builder's on-demand contact-profile refresh (Task 3). They
// mirror messengerIntegrationService/instagramIntegrationService.
// findByInboxIdForWorkspace: scope by BOTH inboxId and workspaceId, throw
// when no row matches. See
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/task-3-brief.md
// ---------------------------------------------------------------------------

const findOrFailMock = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    transaction: vi.fn(),
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: findOrFailMock,
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { zalo: "zalo" } },
  integrationTypes: { enum: { telegram: "telegram" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationZaloModel: { __table: "IntegrationZalo" },
  integrationTelegramModel: { __table: "IntegrationTelegram" },
  tagChannelModel: { __table: "TagChannel" },
}))

// These new imports (added alongside `connect`/`disconnect` on both
// services) pull in real modules transitively — mock them at the boundary
// so this narrow lookup test doesn't have to satisfy their own dependency
// graphs (e.g. `@chatbotx.io/analytics`'s schema requirements).
vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: vi.fn(),
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: vi.fn() },
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueChannelScan: vi.fn() },
}))

vi.mock("../src/workspace", () => ({
  workspaceService: { create: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("zaloIntegrationService.findByInboxIdForWorkspace", () => {
  test("scopes the lookup by both inboxId and workspaceId", async () => {
    const { zaloIntegrationService } = await import(
      "../src/integration-zalo/service"
    )
    const row = { id: "zalo-1", inboxId: "inbox-1", workspaceId: "ws-1" }
    findOrFailMock.mockResolvedValueOnce(row)

    await expect(
      zaloIntegrationService.findByInboxIdForWorkspace({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBe(row)

    expect(findOrFailMock).toHaveBeenCalledWith({
      table: { __table: "IntegrationZalo" },
      where: { inboxId: "inbox-1", workspaceId: "ws-1" },
    })
  })

  test("throws when no row matches the scope", async () => {
    const { zaloIntegrationService } = await import(
      "../src/integration-zalo/service"
    )
    findOrFailMock.mockRejectedValueOnce(new Error("Record not found"))

    await expect(
      zaloIntegrationService.findByInboxIdForWorkspace({
        inboxId: "inbox-missing",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Record not found")
  })
})

describe("telegramIntegrationService.findByInboxIdForWorkspace", () => {
  test("scopes the lookup by both inboxId and workspaceId", async () => {
    const { telegramIntegrationService } = await import(
      "../src/integration-telegram/service"
    )
    const row = { id: "telegram-1", inboxId: "inbox-2", workspaceId: "ws-2" }
    findOrFailMock.mockResolvedValueOnce(row)

    await expect(
      telegramIntegrationService.findByInboxIdForWorkspace({
        inboxId: "inbox-2",
        workspaceId: "ws-2",
      }),
    ).resolves.toBe(row)

    expect(findOrFailMock).toHaveBeenCalledWith({
      table: { __table: "IntegrationTelegram" },
      where: { inboxId: "inbox-2", workspaceId: "ws-2" },
    })
  })

  test("throws when no row matches the scope", async () => {
    const { telegramIntegrationService } = await import(
      "../src/integration-telegram/service"
    )
    findOrFailMock.mockRejectedValueOnce(new Error("Record not found"))

    await expect(
      telegramIntegrationService.findByInboxIdForWorkspace({
        inboxId: "inbox-missing",
        workspaceId: "ws-2",
      }),
    ).rejects.toThrow("Record not found")
  })
})
