import { beforeEach, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tenantService.suspend/reactivate drive the Connection teardown engine for
// every one of the owner's channels: suspend pauses the owner's workspaces
// (teardownLevel "pause", reason "tenant_suspended") via
// workspaceLifecycleService.deactivateOwnerWorkspaces, and reactivate must
// resume every Connection that pause left `paused` via the `teardown.resume`
// edge — the counterpart that re-consumes the `channels` quota unit
// `teardown.pause` released.
// ---------------------------------------------------------------------------

const state = {
  updatedTenantRow: { id: "tenant-1" } as { id: string } | undefined,
  pausedConnections: [] as { id: string }[],
}

const deactivateOwnerWorkspacesMock = vi.fn(async () => [] as string[])
const connectionTransitionMock = vi.fn(async () => undefined)
const listPausedByOwnerMock = vi.fn(async () => state.pausedConnections)
const listTenantSuspendedWithoutConnectionByOwnerMock = vi.fn(
  async () => [] as { id: string; workspaceId: string }[],
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            const row = state.updatedTenantRow
            return row ? [row] : []
          }),
        })),
      })),
    })),
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}))

// Partial mock: other modules in the import chain read real models off the
// schema, so keep the originals and only override tenantModel.
vi.mock("@chatbotx.io/database/schema", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tenantModel: { id: "tenant.id", ownerId: "tenant.ownerId" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { listPausedByOwner: listPausedByOwnerMock },
  inboxRepository: {
    listTenantSuspendedWithoutConnectionByOwner:
      listTenantSuspendedWithoutConnectionByOwnerMock,
  },
}))

// Partial mock for the same reason as the schema mock above: analytics
// services in the import chain read real exports (e.g. bloomFilter) at
// module scope.
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withCache: (_key: string, fn: () => unknown) => fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { transition: connectionTransitionMock },
}))

vi.mock("../src/workspace-lifecycle/service", () => ({
  workspaceLifecycleService: {
    deactivateOwnerWorkspaces: deactivateOwnerWorkspacesMock,
  },
}))

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: { clearWhiteLabelEntitlements: vi.fn() },
}))

// Dynamic import, matching `tenant-reconcile.test.ts`'s established
// convention: the module under test must load after the `vi.mock` factories
// above (several of which are async `importOriginal` partial mocks) have
// resolved, which a static top-level import cannot sequence.
const { tenantService } = await import("../src/enterprise/tenant/service")

beforeEach(() => {
  vi.clearAllMocks()
  state.updatedTenantRow = { id: "tenant-1" }
  state.pausedConnections = []
  deactivateOwnerWorkspacesMock.mockResolvedValue([])
  connectionTransitionMock.mockResolvedValue(undefined)
  listPausedByOwnerMock.mockImplementation(async () => state.pausedConnections)
  listTenantSuspendedWithoutConnectionByOwnerMock.mockResolvedValue([])
})

test("suspend pauses the owner's workspaces with teardownLevel pause and reason tenant_suspended", async () => {
  await tenantService.suspend("owner-1")

  expect(deactivateOwnerWorkspacesMock).toHaveBeenCalledWith({
    ownerId: "owner-1",
    reason: "tenant_suspended",
    teardownLevel: "pause",
  })
})

test("reactivate resumes every paused connection for the owner via teardown.resume", async () => {
  state.pausedConnections = [{ id: "connection-1" }, { id: "connection-2" }]

  await tenantService.reactivate("owner-1")

  expect(listPausedByOwnerMock).toHaveBeenCalledWith({ ownerId: "owner-1" })
  expect(connectionTransitionMock).toHaveBeenNthCalledWith(1, {
    connectionId: "connection-1",
    event: "teardown.resume",
    ownerId: "owner-1",
  })
  expect(connectionTransitionMock).toHaveBeenNthCalledWith(2, {
    connectionId: "connection-2",
    event: "teardown.resume",
    ownerId: "owner-1",
  })
})

test("reactivate is a no-op resume sweep when the owner has no paused connections", async () => {
  state.pausedConnections = []

  await tenantService.reactivate("owner-1")

  expect(connectionTransitionMock).not.toHaveBeenCalled()
})
