// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAuditRecord,
  mockDbDelete,
  mockDbInsert,
  mockDbUpdate,
  mockFindOrFail,
  mockGetCurrentUserAndTargetWorkspace,
  mockInsertReturning,
  mockInsertValues,
  mockInvalidateCacheByTags,
  mockIsCommunity,
  mockQuotaHasReachedLimit,
  mockUpdateReturning,
  mockUpdateSet,
  mockUserFindFirst,
  mockWorkspaceFindById,
  mockWorkspaceMemberServiceDelete,
  mockWorkspaceMemberServiceListByWorkspaceId,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockDbInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn()
  mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockDbUpdate = vi.fn(() => ({ set: mockUpdateSet }))
  const mockDeleteWhere = vi.fn()
  const mockDbDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockAuditRecord: vi.fn(),
    mockDbDelete,
    mockDbInsert,
    mockDbUpdate,
    mockDeleteWhere,
    mockFindOrFail: vi.fn(),
    mockGetCurrentUserAndTargetWorkspace: vi.fn(),
    mockInsertReturning,
    mockWorkspaceMemberServiceDelete: vi.fn(),
    mockWorkspaceMemberServiceListByWorkspaceId: vi.fn(),
    mockInsertValues,
    mockInvalidateCacheByTags: vi.fn(),
    mockIsCommunity: vi.fn(),
    mockQuotaHasReachedLimit: vi.fn(),
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdateWhere,
    mockUserFindFirst: vi.fn(),
    mockWorkspaceFindById: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClient: chain,
    workspaceActionClientAllowExpired: chain,
  }
})

vi.mock("@/env", () => ({
  isCommunity: mockIsCommunity,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberCacheTag: (userId: string) =>
    `users:${userId}:workspace-members`,
  quotaEnforcementService: {
    hasReachedLimit: mockQuotaHasReachedLimit,
  },
  workspaceMemberService: {
    delete: mockWorkspaceMemberServiceDelete,
    listByWorkspaceId: mockWorkspaceMemberServiceListByWorkspaceId,
  },
  workspaceService: {
    findById: mockWorkspaceFindById,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDbDelete,
    insert: mockDbInsert,
    update: mockDbUpdate,
    query: {
      userModel: {
        findFirst: mockUserFindFirst,
      },
    },
  },
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mockAuditRecord },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  invitationModel: { _: "invitationModel" },
  workspaceMemberModel: {
    id: "workspaceMember.id",
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "invitation-id",
    SymbolicSnowflakeIDs: {
      generate: () => "invite-code",
    },
  }
})

const { inviteWorkspaceMemberAction } = await import(
  "../src/features/workspace-members/actions/invite-workspace-member.action"
)
const { updateWorkspaceMemberAction } = await import(
  "../src/features/workspace-members/actions/update-workspace-member.action"
)
const { deleteWorkspaceMemberAction } = await import(
  "../src/features/workspace-members/actions/delete-workspace-member.action"
)
const { getSuperAdminPermissions, normalizeContactsPermissions } = await import(
  "../src/features/workspace-members/helpers"
)

const WORKSPACE_ID = "ws-1"
const MEMBER_ID = "member-1"
const MEMBER_USER_ID = "member-user-1"

const granularPermissions = {
  superAdmin: false,
  analytics: true,
  flows: false,
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: false,
  broadcast: false,
  ecommerce: false,
}

const assignedOnlyPermissions = {
  ...granularPermissions,
  contacts: false,
  onlyAssignedContacts: true,
}

const fullPermissions = getSuperAdminPermissions()
const normalizedGranularPermissions =
  normalizeContactsPermissions(granularPermissions)

const updateInput = {
  permissions: granularPermissions,
  notificationTypes: {
    notifyAdmin: true,
    newMessageToHuman: false,
    newOrder: false,
  },
  notificationChannels: {
    messenger: false,
    email: true,
    telegram: false,
    browser: true,
  },
}

function actionCtx(permissions = granularPermissions) {
  return {
    ctx: { user: { id: "user-1" } },
    bindArgsParsedInputs: [WORKSPACE_ID],
    parsedInput: { permissions },
  }
}

function updateActionCtx(permissions = granularPermissions) {
  return {
    bindArgsParsedInputs: [WORKSPACE_ID, MEMBER_ID],
    parsedInput: { ...updateInput, permissions },
  }
}

function getInsertedValues() {
  return (
    mockInsertValues.mock.calls as unknown as [[{ permissions: unknown }]]
  )[0][0]
}

function mockCurrentMember(permissions = fullPermissions) {
  mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
    user: { id: "user-1" },
    targetWorkspace: { id: WORKSPACE_ID, ownerId: "owner-1" },
    targetWorkspaceMember: { permissions },
  })
}

describe("workspace member permission helpers", () => {
  test("normalizes mutually exclusive contact access without mutating input", () => {
    expect(normalizeContactsPermissions(granularPermissions)).toEqual({
      ...granularPermissions,
      onlyAssignedContacts: false,
    })
    expect(granularPermissions.onlyAssignedContacts).toBe(true)
    expect(normalizeContactsPermissions(assignedOnlyPermissions)).toEqual(
      assignedOnlyPermissions,
    )
  })
})

describe("inviteWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceFindById.mockResolvedValue({
      id: WORKSPACE_ID,
      ownerId: "owner-1",
    })
    mockQuotaHasReachedLimit.mockResolvedValue(false)
    mockInsertReturning.mockResolvedValue([
      { id: "invitation-id", code: "invite-code" },
    ])
    mockIsCommunity.mockReturnValue(false)
  })

  test("rejects non-super-admin members before creating invitations", async () => {
    mockCurrentMember(granularPermissions)

    await expect(
      (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
        actionCtx(),
      ),
    ).rejects.toThrow(
      "You are not authorized to invite a workspace member. You need to be a super admin to do this.",
    )

    expect(mockQuotaHasReachedLimit).not.toHaveBeenCalled()
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  test("forces full super-admin permissions for community invitations", async () => {
    mockCurrentMember()
    mockIsCommunity.mockReturnValue(true)

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(),
    )

    const insertedValues = getInsertedValues()
    expect(insertedValues.permissions).toEqual(fullPermissions)
  })

  test("normalizes full contacts permissions outside community edition", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(),
    )

    const insertedValues = getInsertedValues()
    expect(insertedValues.permissions).toEqual(normalizedGranularPermissions)
  })

  test("preserves assigned-only contacts permissions outside community edition", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(assignedOnlyPermissions),
    )

    const insertedValues = getInsertedValues()
    expect(insertedValues.permissions).toEqual(assignedOnlyPermissions)
  })

  test("records an invite audit event labeled with the granted role", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(),
    )

    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: "invite",
      detail: "invited a new member",
    })
  })
})

describe("updateWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      permissions: fullPermissions,
    })
    mockCurrentMember()
    mockWorkspaceFindById.mockResolvedValue({
      id: WORKSPACE_ID,
      ownerId: "owner-1",
    })
    mockIsCommunity.mockReturnValue(false)
    mockUserFindFirst.mockResolvedValue({
      name: "Target User",
      email: "target@example.com",
    })
    mockUpdateReturning.mockResolvedValue([{ id: MEMBER_ID }])
  })

  test("records a role_change audit event with the target member's name", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: "role_change",
      detail: "changed role of Target User to member",
    })
  })

  test("forces full super-admin permissions for community updates", async () => {
    mockIsCommunity.mockReturnValue(true)
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      permissions: normalizedGranularPermissions,
    })

    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockUpdateSet).toHaveBeenCalledWith({
      ...updateInput,
      permissions: fullPermissions,
    })
  })

  test("normalizes full contacts permissions outside community edition", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockUpdateSet).toHaveBeenCalledWith({
      ...updateInput,
      permissions: normalizedGranularPermissions,
    })
  })

  test("preserves assigned-only contacts permissions outside community edition", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(assignedOnlyPermissions),
    )

    expect(mockUpdateSet).toHaveBeenCalledWith({
      ...updateInput,
      permissions: assignedOnlyPermissions,
    })
  })

  test("invalidates the member's cached workspace list after updating", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      `users:${MEMBER_USER_ID}:workspace-members`,
    ])
  })

  test("skips DB update, cache invalidation, and audit when nothing changed", async () => {
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      permissions: normalizedGranularPermissions,
      notificationTypes: updateInput.notificationTypes,
      notificationChannels: updateInput.notificationChannels,
    })

    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
    expect(mockUserFindFirst).not.toHaveBeenCalled()
    expect(mockAuditRecord).not.toHaveBeenCalled()
  })

  test("still writes the update when only notification settings change, without auditing a role change", async () => {
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      // Same permissions as the submitted payload — only notification
      // fields differ from what's stored.
      permissions: normalizedGranularPermissions,
      notificationTypes: {
        notifyAdmin: false,
        newMessageToHuman: false,
        newOrder: false,
      },
      notificationChannels: {
        messenger: false,
        email: false,
        telegram: false,
        browser: false,
      },
    })

    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockUpdateSet).toHaveBeenCalledWith({
      ...updateInput,
      permissions: normalizedGranularPermissions,
    })
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      `users:${MEMBER_USER_ID}:workspace-members`,
    ])
    // Permissions didn't actually change, so this must not be recorded as
    // a "changed role" audit event.
    expect(mockUserFindFirst).not.toHaveBeenCalled()
    expect(mockAuditRecord).not.toHaveBeenCalled()
  })

  test("records role change for a real permission change", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockUpdateReturning).toHaveBeenCalledWith({
      id: "workspaceMember.id",
    })
    expect(mockInvalidateCacheByTags).toHaveBeenCalled()
    expect(mockAuditRecord).toHaveBeenCalledWith({
      action: "role_change",
      detail: "changed role of Target User to member",
    })
  })

  test("skips cache invalidation and audit when update races a concurrent delete", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockDbUpdate).toHaveBeenCalled()
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
    expect(mockUserFindFirst).not.toHaveBeenCalled()
    expect(mockAuditRecord).not.toHaveBeenCalled()
  })
})

function deleteActionCtx() {
  return {
    bindArgsParsedInputs: [WORKSPACE_ID, MEMBER_ID],
  }
}

describe("deleteWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      role: "agent",
    })
    mockCurrentMember()
  })

  test("rejects deleting the last workspace owner", async () => {
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      role: "owner",
    })
    mockWorkspaceMemberServiceListByWorkspaceId.mockResolvedValue([
      { id: MEMBER_ID, role: "owner" },
    ])

    await expect(
      (deleteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
        deleteActionCtx(),
      ),
    ).rejects.toThrow("You cannot delete the last owner of the workspace")

    expect(mockWorkspaceMemberServiceDelete).not.toHaveBeenCalled()
  })

  test("rejects non-super-admin members before deleting", async () => {
    mockCurrentMember(granularPermissions)

    await expect(
      (deleteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
        deleteActionCtx(),
      ),
    ).rejects.toThrow(
      "You are not authorized to delete this workspace member. You need to be a super admin to do this.",
    )

    expect(mockWorkspaceMemberServiceDelete).not.toHaveBeenCalled()
  })

  test("invalidates the removed member's cached workspace list", async () => {
    await (deleteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      deleteActionCtx(),
    )

    expect(mockWorkspaceMemberServiceDelete).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      `users:${MEMBER_USER_ID}:workspace-members`,
    ])
  })

  test("deletes the member without mutating team-member quota", async () => {
    await (deleteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      deleteActionCtx(),
    )

    expect(mockWorkspaceMemberServiceDelete).toHaveBeenCalledOnce()
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      `users:${MEMBER_USER_ID}:workspace-members`,
    ])
  })
})
