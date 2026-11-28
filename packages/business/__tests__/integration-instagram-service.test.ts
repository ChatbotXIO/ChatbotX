// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockMarkDegradedByIdentifier,
  mockMarkUnhealthyByIdentifier,
  mockUpdateReturning,
  teardown,
} = vi.hoisted(() => ({
  teardown: {
    cancelForInbox: vi.fn(async () => undefined),
    tearDownForIntegration: vi.fn(async () => undefined),
    cancelForIntegration: vi.fn(async () => undefined),
    deleteByIntegration: vi.fn(async () => undefined),
    disconnectInbox: vi.fn(async () => undefined),
    tx: { delete: vi.fn(() => ({ where: vi.fn() })) },
  },
  mockMarkDegradedByIdentifier: vi.fn(async () => null),
  mockMarkUnhealthyByIdentifier: vi.fn(async () => null),
  mockUpdateReturning: vi.fn(async () => [{ igId: "ig-1", type: "instagram" }]),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: mockUpdateReturning })),
      })),
    })),
  },
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationInstagramModel: {
    id: "id",
    workspaceId: "workspaceId",
    igId: "igId",
    type: "type",
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCapiEventRepository: {
    deleteByIntegration: teardown.deleteByIntegration,
  },
}))
vi.mock("../src/coexist/service", () => ({
  coexistService: { tearDownForIntegration: teardown.tearDownForIntegration },
}))
vi.mock("../src/contact-scan/service", () => ({
  contactScanService: { cancelForIntegration: teardown.cancelForIntegration },
}))
vi.mock("../src/contact-sync/service", () => ({
  contactSyncService: { cancelForInbox: teardown.cancelForInbox },
}))

vi.mock("../src/connection/record-refreshed-auth", () => ({
  recordRefreshedAuth: vi.fn(),
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    disconnectInbox: teardown.disconnectInbox,
    runDisconnectInTransaction: async (
      scope: { tx?: unknown; pendingRelease?: unknown },
      work: (tx: unknown, pendingRelease: unknown) => Promise<void>,
    ) => await work(scope.tx ?? teardown.tx, scope.pendingRelease),
    markDegradedByIdentifier: mockMarkDegradedByIdentifier,
    markUnhealthyByIdentifier: mockMarkUnhealthyByIdentifier,
  },
}))

// Dynamic: `vi.mock` calls above are hoisted above any static import of the
// SUT, so importing it must happen after those mocks are registered.
const { instagramIntegrationService } = await import(
  "../src/integration-instagram/service"
)

describe("instagramIntegrationService.markTokenRefreshError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ igId: "ig-1", type: "instagram" }])
  })

  test("degrades the Connection by igId as `instagram` on a transient refresh failure", async () => {
    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "instagram",
      identifier: "ig-1",
      workspaceId: "ws-1",
      reason: "refresh_failed",
    })
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })

  test("resolves the `instagramFacebook` provider for a Facebook-login coexist row", async () => {
    mockUpdateReturning.mockResolvedValue([{ igId: "ig-1", type: "facebook" }])

    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).toHaveBeenCalledWith({
      provider: "instagramFacebook",
      identifier: "ig-1",
      workspaceId: "ws-1",
      reason: "refresh_failed",
    })
  })

  test("marks the Connection unhealthy when the provider confirms the token was revoked", async () => {
    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "revoked",
      isRevoked: true,
    })

    expect(mockMarkUnhealthyByIdentifier).toHaveBeenCalledWith({
      provider: "instagram",
      identifier: "ig-1",
      workspaceId: "ws-1",
      reason: "token_revoked",
    })
    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
  })

  test("no-ops the engine notification when the satellite row no longer exists", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await instagramIntegrationService.markTokenRefreshError({
      id: "integration-1",
      workspaceId: "ws-1",
      error: "boom",
      isRevoked: false,
    })

    expect(mockMarkDegradedByIdentifier).not.toHaveBeenCalled()
    expect(mockMarkUnhealthyByIdentifier).not.toHaveBeenCalled()
  })
})

describe("instagramIntegrationService.updateAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([])
  })

  test("rejects with notFoundException when the update matches zero rows", async () => {
    await expect(
      instagramIntegrationService.updateAuth({
        id: "integration-1",
        workspaceId: "ws-1",
        auth: { token: "x" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("instagramIntegrationService.disconnectChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("tears the channel down and disconnects the inbox in one transaction", async () => {
    await instagramIntegrationService.disconnectChannel({
      integration: { id: "ig-row-1", inboxId: "inbox-1" },
      workspaceId: "ws-1",
      ownerId: "owner-1",
    })

    expect(teardown.cancelForInbox).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        lock: { channel: "instagram", integrationId: "ig-row-1" },
      },
      teardown.tx,
    )
    expect(teardown.tearDownForIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationId: "ig-row-1",
        channel: "instagram",
        tx: teardown.tx,
      }),
    )
    expect(teardown.cancelForIntegration).toHaveBeenCalledWith({
      channel: "instagram",
      integrationId: "ig-row-1",
      tx: teardown.tx,
    })
    expect(teardown.deleteByIntegration).toHaveBeenCalledWith(
      { workspaceId: "ws-1", channel: "instagram", integrationId: "ig-row-1" },
      teardown.tx,
    )
    expect(teardown.tx.delete).toHaveBeenCalledTimes(1)
    expect(teardown.disconnectInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-1",
        ownerId: "owner-1",
        workspaceId: "ws-1",
        tx: teardown.tx,
      }),
    )
  })
})
