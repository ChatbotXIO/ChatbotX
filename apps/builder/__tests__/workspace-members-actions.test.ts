// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
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
  mockUpdateSet,
  mockWorkspaceFindById,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockDbInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockUpdateWhere = vi.fn()
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockDbUpdate = vi.fn(() => ({ set: mockUpdateSet }))
  const mockDeleteWhere = vi.fn()
  const mockDbDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockDbDelete,
    mockDbInsert,
    mockDbUpdate,
    mockDeleteWhere,
    mockFindOrFail: vi.fn(),
    mockGetCurrentUserAndTargetWorkspace: vi.fn(),
    mockInsertReturning,
    mockInsertValues,
    mockInvalidateCacheByTags: vi.fn(),
    mockIsCommunity: vi.fn(),
    mockQuotaHasReachedLimit: vi.fn(),
    mockUpdateSet,
    mockUpdateWhere,
    mockWorkspaceFindById: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@/env", () => ({
  isCommunity: mockIsCommunity,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: {
    hasReachedLimit: mockQuotaHasReachedLimit,
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
  },
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  invitationModel: { _: "invitationModel" },
  workspaceMemberModel: {
    id: "workspaceMember.id",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "invitation-id",
  SymbolicSnowflakeIDs: {
    generate: () => "invite-code",
  },
  zodBigintAsString: () => ({
    describe: () => ({ _: "zodBigintAsString" }),
  }),
}))

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
})

describe("updateWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
    })
    mockCurrentMember()
    mockIsCommunity.mockReturnValue(false)
  })

  test("forces full super-admin permissions for community updates", async () => {
    mockIsCommunity.mockReturnValue(true)

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

  test("rejects deleting the workspace owner", async () => {
    mockFindOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      role: "owner",
    })

    await expect(
      (deleteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
        deleteActionCtx(),
      ),
    ).rejects.toThrow("You cannot delete the owner of the workspace")

    expect(mockDbDelete).not.toHaveBeenCalled()
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

    expect(mockDbDelete).not.toHaveBeenCalled()
  })

  test("invalidates the removed member's cached workspace list", async () => {
    await (deleteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      deleteActionCtx(),
    )

    expect(mockDbDelete).toHaveBeenCalled()
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      `users:${MEMBER_USER_ID}:workspace-members`,
    ])
  })
})
