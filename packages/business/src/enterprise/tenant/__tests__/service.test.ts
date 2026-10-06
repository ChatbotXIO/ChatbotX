import { beforeEach, describe, expect, test, vi } from "vitest"
import { channelLimitReachedException } from "../../../errors"
import { tenantService } from "../service"

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  listPausedByOwner: vi.fn(),
  listTenantSuspendedWithoutConnectionByOwner: vi.fn(),
  transition: vi.fn(),
  resumeTenantSuspended: vi.fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mocks.returning,
        }),
      }),
    }),
  },
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  CREATABLE_CHANNELS: [],
  ROOT_TENANT_ID: "root-tenant",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { listPausedByOwner: mocks.listPausedByOwner },
  inboxRepository: {
    listTenantSuspendedWithoutConnectionByOwner:
      mocks.listTenantSuspendedWithoutConnectionByOwner,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tenantModel: { id: "id", ownerId: "ownerId" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

vi.mock("../../../connection/state-service", () => ({
  connectionStateService: { transition: mocks.transition },
}))

vi.mock("../../../inbox/service", () => ({
  inboxService: { resumeTenantSuspended: mocks.resumeTenantSuspended },
}))

vi.mock("../../../logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../../../user-quota/service", () => ({
  userQuotaService: {
    clearWhiteLabelEntitlements: vi.fn(),
    hasWhiteLabelEntitlement: vi.fn(),
  },
}))

vi.mock("../../../workspace-lifecycle/service", () => ({
  workspaceLifecycleService: { deactivateOwnerWorkspaces: vi.fn() },
}))

const pausedConnection = (id: string) => ({
  id,
  workspaceId: `ws-${id}`,
  status: "paused",
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.returning.mockResolvedValue([{ id: "tenant-1" }])
  mocks.listTenantSuspendedWithoutConnectionByOwner.mockResolvedValue([])
  mocks.transition.mockResolvedValue(undefined)
  mocks.resumeTenantSuspended.mockResolvedValue(undefined)
})

describe("tenantService.reactivate", () => {
  test("a channelLimitReached error resuming one connection does not abort the sweep: the rest still resume and the failed one is logged, not thrown", async () => {
    mocks.listPausedByOwner.mockResolvedValue([
      pausedConnection("conn-1"),
      pausedConnection("conn-2"),
      pausedConnection("conn-3"),
    ])
    mocks.transition
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(channelLimitReachedException())
      .mockResolvedValueOnce(undefined)

    await expect(tenantService.reactivate("owner-1")).resolves.toBeUndefined()

    expect(mocks.transition).toHaveBeenCalledTimes(3)
    for (const [index, id] of ["conn-1", "conn-2", "conn-3"].entries()) {
      expect(mocks.transition).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          connectionId: id,
          event: "teardown.resume",
          ownerId: "owner-1",
        }),
      )
    }

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0]?.[0]).toMatchObject({
      connectionId: "conn-2",
      ownerId: "owner-1",
      err: { code: "channelLimitReached" },
    })
  })

  test("every paused connection being over the limit still resumes none of them by throwing out of reactivate", async () => {
    mocks.listPausedByOwner.mockResolvedValue([
      pausedConnection("conn-1"),
      pausedConnection("conn-2"),
    ])
    mocks.transition.mockRejectedValue(channelLimitReachedException())

    await expect(tenantService.reactivate("owner-1")).resolves.toBeUndefined()

    expect(mocks.transition).toHaveBeenCalledTimes(2)
    expect(mocks.loggerError).toHaveBeenCalledTimes(2)
  })

  test("also resumes pre-backfill Inbox rows paused without a Connection row, independently try/caught", async () => {
    mocks.listPausedByOwner.mockResolvedValue([])
    mocks.listTenantSuspendedWithoutConnectionByOwner.mockResolvedValue([
      { id: "inbox-1", workspaceId: "ws-1" },
      { id: "inbox-2", workspaceId: "ws-2" },
    ])
    mocks.resumeTenantSuspended
      .mockRejectedValueOnce(channelLimitReachedException())
      .mockResolvedValueOnce(undefined)

    await expect(tenantService.reactivate("owner-1")).resolves.toBeUndefined()

    expect(mocks.resumeTenantSuspended).toHaveBeenCalledTimes(2)
    expect(mocks.resumeTenantSuspended).toHaveBeenNthCalledWith(1, {
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
    })
    expect(mocks.resumeTenantSuspended).toHaveBeenNthCalledWith(2, {
      inboxId: "inbox-2",
      workspaceId: "ws-2",
      ownerId: "owner-1",
    })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.loggerError.mock.calls[0]?.[0]).toMatchObject({
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
  })
})
