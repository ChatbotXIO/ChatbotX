// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const invitationService = { create: vi.fn() }
const workspaceMemberService = {
  delete: vi.fn(),
  findByIdOrFail: vi.fn(),
  findByIdWithUser: vi.fn(),
  listPaginated: vi.fn(),
  updateMember: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  invitationService,
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  quotaEnforcementService: { isAtLimit },
  userQuotaService: { getAccessState },
  workspaceMemberService,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { workspaceMembersPublicRouter } = await import(
  "../src/features/workspace-members/api/public"
)

const TOKEN = "cbx_ws_fixture"
const MEMBER_ID = "999999"

const permissions = {
  superAdmin: true,
  analytics: true,
  flows: true,
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: true,
  broadcast: true,
  ecommerce: true,
}

const updateInput = {
  memberId: MEMBER_ID,
  permissions,
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

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: workspace members public API scope wiring", () => {
  test("an unrelated scope is denied list with the inbox scope error", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(workspaceMembersPublicRouter.list),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
  })

  test("an inbox-scoped token can call list", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    workspaceMemberService.listPaginated.mockResolvedValue({
      data: [],
      pageCount: 1,
    })

    await expect(invoke(workspaceMembersPublicRouter.list)).resolves.toEqual({
      data: [],
      pageCount: 1,
    })

    expect(workspaceMemberService.listPaginated).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      page: 1,
      perPage: 50,
      keyword: null,
    })
  })

  test("an inbox-scoped token can call get", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    workspaceMemberService.findByIdWithUser.mockResolvedValue(undefined)

    await expect(
      invoke(workspaceMembersPublicRouter.get, { memberId: MEMBER_ID }),
    ).rejects.toThrow("Member not found")

    expect(workspaceMemberService.findByIdWithUser).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: "ws-1",
    })
  })

  test.each([
    [
      "POST /v1/members/invitations",
      () => invoke(workspaceMembersPublicRouter.invite, { permissions }),
    ],
    [
      "PUT /v1/members/{memberId}",
      () => invoke(workspaceMembersPublicRouter.update, updateInput),
    ],
    [
      "DELETE /v1/members/{memberId}",
      () =>
        invoke(workspaceMembersPublicRouter.remove, { memberId: MEMBER_ID }),
    ],
  ])("an inbox-scoped token is denied %s with the workspace scope error", async (_label, run) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))

    await expect(run()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'workspace' scope",
    })

    expect(invitationService.create).not.toHaveBeenCalled()
    expect(workspaceMemberService.updateMember).not.toHaveBeenCalled()
    expect(workspaceMemberService.delete).not.toHaveBeenCalled()
  })

  test.each([
    [
      "POST /v1/members/invitations",
      () => invoke(workspaceMembersPublicRouter.invite, { permissions }),
    ],
    [
      "PUT /v1/members/{memberId}",
      () => invoke(workspaceMembersPublicRouter.update, updateInput),
    ],
    [
      "DELETE /v1/members/{memberId}",
      () =>
        invoke(workspaceMembersPublicRouter.remove, { memberId: MEMBER_ID }),
    ],
  ])("a read_only token is denied %s before any write service call", async (_label, run) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null, "read_only"))

    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(invitationService.create).not.toHaveBeenCalled()
    expect(workspaceMemberService.updateMember).not.toHaveBeenCalled()
    expect(workspaceMemberService.delete).not.toHaveBeenCalled()
  })

  test("a workspace-scoped token can call invite", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["workspace"]))
    invitationService.create.mockResolvedValue({
      id: "123456",
      code: "invite-code",
      permissions,
      workspaceId: "ws-1",
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const invitation = await invoke(workspaceMembersPublicRouter.invite, {
      permissions,
    })

    expect(invitation).toMatchObject({ id: "123456", code: "invite-code" })
    expect(invitation).not.toHaveProperty("workspaceId")

    expect(invitationService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      permissions,
      invitedBy: "owner-1",
    })
  })

  test("a workspace-scoped token can call update", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["workspace"]))
    workspaceMemberService.updateMember.mockRejectedValue(
      new Error("Workspace member update failed"),
    )

    await expect(
      invoke(workspaceMembersPublicRouter.update, updateInput),
    ).rejects.toThrow("Workspace member update failed")

    expect(workspaceMemberService.updateMember).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: "ws-1",
      data: {
        permissions,
        notificationTypes: updateInput.notificationTypes,
        notificationChannels: updateInput.notificationChannels,
      },
    })
    // A failed update must never reach the post-update read.
    expect(workspaceMemberService.findByIdOrFail).not.toHaveBeenCalled()
  })

  test("a workspace-scoped token can call remove", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["workspace"]))
    workspaceMemberService.findByIdOrFail.mockRejectedValue(
      new Error("Workspace member not found"),
    )

    await expect(
      invoke(workspaceMembersPublicRouter.remove, { memberId: MEMBER_ID }),
    ).rejects.toThrow("Workspace member not found")

    expect(workspaceMemberService.findByIdOrFail).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: "ws-1",
    })
  })

  test("a workspace-scoped token is denied list and get with the inbox scope error", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["workspace"]))

    await expect(
      invoke(workspaceMembersPublicRouter.list),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
    await expect(
      invoke(workspaceMembersPublicRouter.get, { memberId: MEMBER_ID }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
  })

  test("remove scopes the client member id to the token workspace", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    workspaceMemberService.findByIdOrFail.mockResolvedValue({
      id: MEMBER_ID,
      role: "agent",
    })
    workspaceMemberService.delete.mockResolvedValue(undefined)

    await invoke(workspaceMembersPublicRouter.remove, { memberId: MEMBER_ID })

    expect(workspaceMemberService.findByIdOrFail).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: "ws-1",
    })
    expect(workspaceMemberService.delete).toHaveBeenCalledWith({
      id: MEMBER_ID,
      workspaceId: "ws-1",
    })
  })
})
