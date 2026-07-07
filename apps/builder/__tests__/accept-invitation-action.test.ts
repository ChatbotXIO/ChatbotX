// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/safe-action", () => ({
  authActionClient: {
    inputSchema: () => ({
      action: (handler: unknown) => handler,
    }),
  },
}))

const findOrFail = vi.fn()
const workspaceMemberFindFirst = vi.fn()
const dbInsertValues = vi.fn()
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      workspaceMemberModel: {
        findFirst: (...args: unknown[]) => workspaceMemberFindFirst(...args),
      },
    },
    insert: () => ({
      values: (...args: unknown[]) => dbInsertValues(...args),
    }),
  },
  findOrFail: (...args: unknown[]) => findOrFail(...args),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  invitationModel: {},
  workspaceMemberModel: {},
}))

const tryConsume = vi.fn()
const workspaceServiceFind = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: {
    tryConsume: (...args: unknown[]) => tryConsume(...args),
  },
  workspaceService: {
    find: (...args: unknown[]) => workspaceServiceFind(...args),
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

const invalidateCacheByTags = vi.fn()
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => invalidateCacheByTags(...args),
}))

const createId = vi.fn(() => "member-id")
vi.mock("@chatbotx.io/utils", () => ({
  createId,
}))

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

function pastDate() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000)
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
    workspaceMemberFindFirst.mockResolvedValue(undefined)
    workspaceServiceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    tryConsume.mockResolvedValue({ ok: true })
    findOrFail.mockResolvedValue({
      code: "abc123",
      workspaceId: "ws-1",
      expiresAt: futureDate(),
      permissions: { superAdmin: false },
    })
  })

  test("inserts the new member and invalidates both the user's and workspace's member-list caches", async () => {
    await invoke()

    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: "user-1",
        role: "agent",
      }),
    )
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "users:user-1:workspace-members",
      "workspaces:ws-1:workspace-members",
    ])
  })

  test("uses the invitation's stored permissions on non-community editions", async () => {
    isCommunity.mockReturnValue(false)

    await invoke()

    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: { superAdmin: false } }),
    )
    expect(getSuperAdminPermissions).not.toHaveBeenCalled()
  })

  test("forces super-admin permissions on community edition regardless of invitation permissions", async () => {
    isCommunity.mockReturnValue(true)

    await invoke()

    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: { superAdmin: true } }),
    )
  })

  test("throws and does not insert or invalidate cache when invitation has expired", async () => {
    findOrFail.mockResolvedValue({
      code: "abc123",
      workspaceId: "ws-1",
      expiresAt: pastDate(),
      permissions: {},
    })

    await expect(invoke()).rejects.toThrow("Invitation expired")
    expect(dbInsertValues).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("throws and does not insert or invalidate cache when user is already a member", async () => {
    workspaceMemberFindFirst.mockResolvedValue({ id: "existing-member" })

    await expect(invoke()).rejects.toThrow(
      "You are already a member of this workspace",
    )
    expect(dbInsertValues).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("throws and does not insert or invalidate cache when team member quota is exceeded", async () => {
    tryConsume.mockResolvedValue({ ok: false, level: "user" })

    await expect(invoke()).rejects.toThrow(
      "Team member limit reached for this workspace plan",
    )
    expect(dbInsertValues).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
