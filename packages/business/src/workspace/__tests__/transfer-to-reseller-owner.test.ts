import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChatbotXException } from "../../errors"
import { transferSubAccountWorkspaceToOwner } from "../transfer-to-reseller-owner"

const RESELLER = "10"
const OLD_OWNER = "20"
const TENANT = "5"
const WORKSPACE = "100"

const mocks = vi.hoisted(() => ({
  findByOwner: vi.fn(),
  lockForOwnerTransfer: vi.fn(),
  lockFirstWorkspace: vi.fn(),
  lockWorkspaceForChildWrite: vi.fn(),
  reassignOwner: vi.fn(),
  deleteNonRootMembers: vi.fn(),
  findByWorkspaceAndUser: vi.fn(),
  setRoleAndPermissions: vi.fn(),
  createMember: vi.fn(),
  removeMembersForUsers: vi.fn(),
  restampCurrentPeriodOwner: vi.fn(),
  reconcileUserSelfUsage: vi.fn(),
  reconcileOwnerPoolUsage: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  decrement: vi.fn(),
  revoke: vi.fn(),
  audit: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) => await fn({}),
  },
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner", agent: "agent" } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceRepository: {
    lockForOwnerTransfer: mocks.lockForOwnerTransfer,
    lockFirstWorkspace: mocks.lockFirstWorkspace,
    lockWorkspaceForChildWrite: mocks.lockWorkspaceForChildWrite,
    reassignOwner: mocks.reassignOwner,
  },
  workspaceMemberRepository: {
    deleteNonRootMembers: mocks.deleteNonRootMembers,
    findByWorkspaceAndUser: mocks.findByWorkspaceAndUser,
    setRoleAndPermissions: mocks.setRoleAndPermissions,
  },
}))
vi.mock("@chatbotx.io/analytics", () => ({
  macRepository: { restampCurrentPeriodOwner: mocks.restampCurrentPeriodOwner },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))
vi.mock("../../audit/dispatcher", () => ({
  dispatchAuditRecordSafely: mocks.audit,
}))
vi.mock("../../enterprise/tenant/service", () => ({
  tenantService: { findByOwner: mocks.findByOwner },
}))
vi.mock("../../logger", () => ({ logger: { error: mocks.loggerError } }))
vi.mock("../../platform/realtime-broadcast", () => ({
  tryRevokeWorkspaceMemberRealtimeConnections: mocks.revoke,
}))
vi.mock("../../user-quota/service", () => ({
  userQuotaService: {
    reconcileUserSelfUsage: mocks.reconcileUserSelfUsage,
    reconcileOwnerPoolUsage: mocks.reconcileOwnerPoolUsage,
  },
}))
vi.mock("../../working-hours/service", () => ({
  workingHoursService: { removeMembersForUsers: mocks.removeMembersForUsers },
}))
vi.mock("../../workspace-member/service", () => ({
  workspaceMemberCacheTag: (userId: string) =>
    `users:${userId}:workspace-members`,
  workspaceRosterCacheTag: (id: string) => `workspaces:${id}:workspace-members`,
  workspaceMemberService: { create: mocks.createMember },
}))
vi.mock("../../workspace-usage/service", () => ({
  workspaceUsageService: { decrement: mocks.decrement },
}))

const input = {
  resellerUserId: RESELLER,
  workspaceId: WORKSPACE,
  actorUserId: RESELLER,
}

const subAccountWorkspace = {
  id: WORKSPACE,
  name: "Shop",
  ownerId: OLD_OWNER,
  tenantId: TENANT,
  ownerTenantId: TENANT,
  purgeStartedAt: null,
  scheduledDeletionAt: null,
}

describe("transferSubAccountWorkspaceToOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByOwner.mockResolvedValue({ id: TENANT, status: "active" })
    mocks.lockForOwnerTransfer.mockResolvedValue(subAccountWorkspace)
    mocks.lockWorkspaceForChildWrite.mockResolvedValue(true)
    mocks.deleteNonRootMembers.mockResolvedValue([OLD_OWNER])
    mocks.findByWorkspaceAndUser.mockResolvedValue(undefined)
  })

  test("moves owner and tenant, removes the old member and adds the reseller as owner", async () => {
    const result = await transferSubAccountWorkspaceToOwner(input)

    expect(mocks.reassignOwner).toHaveBeenCalledWith(
      { id: WORKSPACE, ownerId: RESELLER, tenantId: "1" },
      expect.anything(),
    )
    expect(mocks.deleteNonRootMembers).toHaveBeenCalledWith(
      WORKSPACE,
      expect.anything(),
    )
    expect(mocks.createMember).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: RESELLER,
          workspaceId: WORKSPACE,
          role: "owner",
        }),
      }),
    )
    expect(mocks.restampCurrentPeriodOwner).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, ownerId: RESELLER, tenantId: "1" },
      expect.anything(),
    )
    expect(mocks.reconcileUserSelfUsage).toHaveBeenCalledWith(OLD_OWNER)
    expect(mocks.reconcileUserSelfUsage).toHaveBeenCalledWith(RESELLER)
    expect(mocks.reconcileOwnerPoolUsage).toHaveBeenCalledWith(RESELLER, TENANT)
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith(
      expect.arrayContaining([
        `workspaces:${WORKSPACE}`,
        `workspaces:${WORKSPACE}:owner-user-id`,
        `users:${OLD_OWNER}:workspace-members`,
        `users:${RESELLER}:workspace-members`,
      ]),
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "transfer_workspace_to_owner",
        userId: RESELLER,
        workspaceId: WORKSPACE,
      }),
      expect.any(String),
    )
    expect(result).toEqual({
      previousOwnerId: OLD_OWNER,
      removedUserIds: [OLD_OWNER],
    })
  })

  test("takes both owners' first-workspace locks in sorted id order", async () => {
    await transferSubAccountWorkspaceToOwner(input)

    expect(
      mocks.lockFirstWorkspace.mock.calls.map(([arg]) => arg.ownerId),
    ).toEqual([RESELLER, OLD_OWNER].sort())
  })

  test("promotes a reseller who is already an agent member instead of inserting", async () => {
    mocks.findByWorkspaceAndUser.mockResolvedValue({ id: "m1" })

    await transferSubAccountWorkspaceToOwner(input)

    expect(mocks.setRoleAndPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "m1",
        role: "owner",
        permissions: expect.objectContaining({ superAdmin: true }),
      }),
      expect.anything(),
    )
    expect(mocks.createMember).not.toHaveBeenCalled()
  })

  test("rejects with forbidden when the tenant is inactive", async () => {
    mocks.findByOwner.mockResolvedValue({ id: TENANT, status: "suspended" })

    await expect(
      transferSubAccountWorkspaceToOwner(input),
    ).rejects.toMatchObject({ code: "forbidden", httpStatusCode: 403 })
    expect(mocks.lockForOwnerTransfer).not.toHaveBeenCalled()
  })

  test("rejects with forbidden when the caller owns no tenant", async () => {
    mocks.findByOwner.mockResolvedValue(undefined)

    await expect(
      transferSubAccountWorkspaceToOwner(input),
    ).rejects.toBeInstanceOf(ChatbotXException)
  })

  test.each([
    ["a workspace in another tenant", { tenantId: "999" }],
    ["a missing workspace", undefined],
    ["a workspace owned by the reseller's own tenant", { ownerTenantId: "1" }],
  ])("returns not found for %s", async (_label, override) => {
    mocks.lockForOwnerTransfer.mockResolvedValue(
      override === undefined
        ? undefined
        : { ...subAccountWorkspace, ...override },
    )

    await expect(
      transferSubAccountWorkspaceToOwner(input),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
    expect(mocks.reassignOwner).not.toHaveBeenCalled()
  })

  test.each([
    ["purge started", { purgeStartedAt: new Date() }],
    ["deletion scheduled", { scheduledDeletionAt: new Date() }],
  ])("returns conflict when %s", async (_label, override) => {
    mocks.lockForOwnerTransfer.mockResolvedValue({
      ...subAccountWorkspace,
      ...override,
    })

    await expect(
      transferSubAccountWorkspaceToOwner(input),
    ).rejects.toMatchObject({ httpStatusCode: 409 })
    expect(mocks.reassignOwner).not.toHaveBeenCalled()
  })

  test("does not fail the move when a post-commit step throws", async () => {
    mocks.reconcileOwnerPoolUsage.mockRejectedValue(new Error("redis down"))

    await expect(transferSubAccountWorkspaceToOwner(input)).resolves.toEqual(
      expect.objectContaining({ previousOwnerId: OLD_OWNER }),
    )
    expect(mocks.loggerError).toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalled()
  })
})
