// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindByIdOrFail,
  mockGetCurrentUserAndTargetWorkspace,
  mockInvitationCreate,
  mockInvalidateCacheByTags,
  mockNormalizeUpdateData,
  mockUpdateMember,
  mockWorkspaceMemberServiceDelete,
} = vi.hoisted(() => ({
  mockFindByIdOrFail: vi.fn(),
  mockGetCurrentUserAndTargetWorkspace: vi.fn(),
  mockInvitationCreate: vi.fn(),
  mockInvalidateCacheByTags: vi.fn(),
  mockNormalizeUpdateData: vi.fn(),
  mockUpdateMember: vi.fn(),
  mockWorkspaceMemberServiceDelete: vi.fn(),
}))

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

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@chatbotx.io/business", () => ({
  invitationService: {
    create: mockInvitationCreate,
  },
  workspaceMemberCacheTag: (userId: string) =>
    `users:${userId}:workspace-members`,
  workspaceMemberService: {
    delete: mockWorkspaceMemberServiceDelete,
    findByIdOrFail: mockFindByIdOrFail,
    normalizeUpdateData: mockNormalizeUpdateData,
    updateMember: mockUpdateMember,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
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

const actionCtx = (permissions = granularPermissions) => ({
  ctx: { user: { id: "user-1" } },
  bindArgsParsedInputs: [WORKSPACE_ID],
  parsedInput: { permissions },
})

const updateActionCtx = (permissions = granularPermissions) => ({
  bindArgsParsedInputs: [WORKSPACE_ID, MEMBER_ID],
  parsedInput: { ...updateInput, permissions },
})

const mockCurrentMember = (permissions = fullPermissions) => {
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
    mockInvitationCreate.mockResolvedValue({
      id: "invitation-id",
      code: "invite-code",
    })
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

    expect(mockInvitationCreate).not.toHaveBeenCalled()
  })

  test("delegates community-edition permission forcing to invitationService", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(),
    )

    expect(mockInvitationCreate).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      permissions: granularPermissions,
      invitedBy: "user-1",
    })
  })

  test("delegates contacts-permission normalization to invitationService", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(),
    )

    expect(mockInvitationCreate).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      permissions: granularPermissions,
      invitedBy: "user-1",
    })
  })

  test("passes assigned-only contacts permissions to invitationService", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(assignedOnlyPermissions),
    )

    expect(mockInvitationCreate).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      permissions: assignedOnlyPermissions,
      invitedBy: "user-1",
    })
  })

  test("delegates invitation audit labels and quota enforcement to invitationService", async () => {
    mockCurrentMember()

    await (inviteWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      actionCtx(),
    )

    expect(mockInvitationCreate).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      permissions: granularPermissions,
      invitedBy: "user-1",
    })
  })
})

describe("updateWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByIdOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      permissions: fullPermissions,
    })
    mockCurrentMember()
    mockNormalizeUpdateData.mockImplementation((data) => ({
      ...data,
      permissions: normalizeContactsPermissions(data.permissions),
    }))
    mockUpdateMember.mockResolvedValue({ id: MEMBER_ID })
  })

  test("uses the service normalizer before updating community-edition permissions", async () => {
    const communityData = { ...updateInput, permissions: fullPermissions }
    mockNormalizeUpdateData.mockReturnValueOnce(communityData)
    mockFindByIdOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      permissions: normalizedGranularPermissions,
    })

    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockNormalizeUpdateData).toHaveBeenCalledWith(updateInput)
    expect(mockUpdateMember).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      data: communityData,
    })
  })

  test("normalizes full contacts permissions and delegates to workspaceMemberService.updateMember", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockNormalizeUpdateData).toHaveBeenCalledWith(updateInput)
    expect(mockUpdateMember).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      data: { ...updateInput, permissions: normalizedGranularPermissions },
    })
  })

  test("preserves assigned-only contacts permissions through workspaceMemberService", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(assignedOnlyPermissions),
    )

    expect(mockUpdateMember).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      data: { ...updateInput, permissions: assignedOnlyPermissions },
    })
  })

  test("calls workspaceMemberService.updateMember, which owns cache invalidation and auditing on success", async () => {
    await (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
      updateActionCtx(),
    )

    expect(mockUpdateMember).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      data: { ...updateInput, permissions: normalizedGranularPermissions },
    })
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("skips updateMember entirely when nothing changed", async () => {
    mockFindByIdOrFail.mockResolvedValue({
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

    expect(mockUpdateMember).not.toHaveBeenCalled()
  })

  test("writes notification-only updates even without a permissions diff", async () => {
    mockFindByIdOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
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

    expect(mockUpdateMember).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      data: { ...updateInput, permissions: normalizedGranularPermissions },
    })
  })

  test("does not throw when updateMember reports no row updated (concurrent delete)", async () => {
    mockUpdateMember.mockResolvedValue(undefined)

    await expect(
      (updateWorkspaceMemberAction as (props: unknown) => Promise<unknown>)(
        updateActionCtx(),
      ),
    ).resolves.toBeUndefined()

    expect(mockUpdateMember).toHaveBeenCalled()
  })
})

const deleteActionCtx = () => ({
  bindArgsParsedInputs: [WORKSPACE_ID, MEMBER_ID],
})

describe("deleteWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByIdOrFail.mockResolvedValue({
      id: MEMBER_ID,
      userId: MEMBER_USER_ID,
      workspaceId: WORKSPACE_ID,
      role: "agent",
    })
    mockCurrentMember()
  })

  test("rejects deleting the workspace owner", async () => {
    mockFindByIdOrFail.mockResolvedValue({
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
