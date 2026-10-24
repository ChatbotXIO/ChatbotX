// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/auth/server", () => ({
  INVITATION_COOKIE_NAME: "chatbotx_invitation",
}))

const resolveTenantByDomain = vi.fn()
vi.mock("@chatbotx.io/auth/tenant", () => ({ resolveTenantByDomain }))

const getDomainFromHeader = vi.fn()
vi.mock("@/lib/domain", () => ({ getDomainFromHeader }))

const cookieDelete = vi.fn()
const cookiesFn = vi.fn(() => ({ delete: cookieDelete }))
vi.mock("next/headers", () => ({ cookies: () => cookiesFn() }))

vi.mock("@/lib/safe-action", () => ({
  authActionClient: {
    inputSchema: () => ({
      action: (handler: unknown) => handler,
    }),
  },
}))

const findActiveByCodeOrFail = vi.fn()
const workspaceMemberFindFirst = vi.fn()

const hasReachedLimit = vi.fn()
const workspaceServiceFind = vi.fn()
const workspaceMemberServiceCreate = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  hasWorkspacePermission: (permissions: Record<string, unknown>, key: string) =>
    permissions.superAdmin === true || permissions[key] === true,
  invitationService: {
    findActiveByCodeOrFail: (...args: unknown[]) =>
      findActiveByCodeOrFail(...args),
  },
  isWorkspaceScheduledForDeletion: (
    workspace:
      | { scheduledDeletionAt?: Date | string | null }
      | null
      | undefined,
  ) => Boolean(workspace?.scheduledDeletionAt),
  quotaEnforcementService: {
    hasReachedLimit: (...args: unknown[]) => hasReachedLimit(...args),
  },
  workspaceMemberService: {
    create: (...args: unknown[]) => workspaceMemberServiceCreate(...args),
    findByWorkspaceIdAndUserId: (...args: unknown[]) =>
      workspaceMemberFindFirst(...args),
  },
  workspaceService: {
    find: (...args: unknown[]) => workspaceServiceFind(...args),
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() =>
    Promise.resolve(() => "This workspace is no longer available"),
  ),
}))

const invalidateCacheByTags = vi.fn()
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => invalidateCacheByTags(...args),
}))

const createId = vi.fn(() => "member-id")
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId,
  }
})

const isCommunity = vi.fn(() => false)
vi.mock("@/env", () => ({
  isCommunity: () => isCommunity(),
}))

const getSuperAdminPermissions = vi.fn(() => ({ superAdmin: true }))
vi.mock("@/features/workspace-members/helpers", () => ({
  getSuperAdminPermissions: () => getSuperAdminPermissions(),
}))

const { acceptInvitationAction } = await import(
  "../src/features/invitations/actions/accept-invitation"
)
const runAcceptInvitation = acceptInvitationAction as unknown as (props: {
  ctx: { user: { id: string } }
  parsedInput: { code: string }
}) => Promise<void>

function futureDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000)
}

function invoke(code = "abc123", userId = "user-1") {
  return runAcceptInvitation({
    ctx: { user: { id: userId } },
    parsedInput: { code },
  })
}

describe("acceptInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createId.mockReturnValue("member-id")
    isCommunity.mockReturnValue(false)
    getSuperAdminPermissions.mockReturnValue({ superAdmin: true })
    getDomainFromHeader.mockResolvedValue("chat.acme.com")
    resolveTenantByDomain.mockResolvedValue("tenant-acme")
    workspaceMemberFindFirst.mockResolvedValue(undefined)
    workspaceServiceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    hasReachedLimit.mockResolvedValue(false)
    findActiveByCodeOrFail.mockResolvedValue({
      code: "abc123",
      workspaceId: "ws-1",
      expiresAt: futureDate(),
      permissions: { superAdmin: false },
    })
  })

  test("resolves the invitation against the tenant bound to the request domain", async () => {
    await invoke()

    expect(resolveTenantByDomain).toHaveBeenCalledWith("chat.acme.com")
    expect(findActiveByCodeOrFail).toHaveBeenCalledWith("abc123", "tenant-acme")
  })

  test("inserts the new member and invalidates both the user's and workspace's member-list caches", async () => {
    await invoke()

    expect(workspaceMemberServiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          userId: "user-1",
          role: "agent",
        }),
      }),
    )
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "users:user-1:workspace-members",
      "workspaces:ws-1:workspace-members",
    ])
  })

  test("clears the invitation cookie after a successful join, so it can't be replayed", async () => {
    await invoke()

    expect(cookieDelete).toHaveBeenCalledWith("chatbotx_invitation")
  })

  test("uses the invitation's stored permissions on non-community editions", async () => {
    isCommunity.mockReturnValue(false)

    await invoke()

    expect(workspaceMemberServiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: { superAdmin: false },
        }),
      }),
    )
    expect(getSuperAdminPermissions).not.toHaveBeenCalled()
  })

  test("forces super-admin permissions on community edition regardless of invitation permissions", async () => {
    isCommunity.mockReturnValue(true)

    await invoke()

    expect(workspaceMemberServiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ permissions: { superAdmin: true } }),
      }),
    )
  })

  test("throws and does not insert, invalidate cache, or clear the cookie when user is already a member", async () => {
    workspaceMemberFindFirst.mockResolvedValue({ id: "existing-member" })

    await expect(invoke()).rejects.toThrow(
      "You are already a member of this workspace",
    )
    expect(workspaceMemberServiceCreate).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
    expect(cookieDelete).not.toHaveBeenCalled()
  })

  test("throws and does not insert or invalidate cache when team member quota is exceeded", async () => {
    hasReachedLimit.mockResolvedValue(true)

    await expect(invoke()).rejects.toThrow(
      "Team member limit reached for this workspace plan",
    )
    expect(workspaceMemberServiceCreate).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
    expect(hasReachedLimit).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "teamMembers",
    })
  })

  test("throws and does not insert when the workspace is scheduled for deletion", async () => {
    workspaceServiceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
      scheduledDeletionAt: new Date(),
    })

    const error = await invoke().catch((caught) => caught)

    expect(error).toMatchObject({
      code: "workspaceScheduledDeletion",
      message: "This workspace is no longer available",
    })
    expect(workspaceMemberServiceCreate).not.toHaveBeenCalled()
    expect(hasReachedLimit).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
