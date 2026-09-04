// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isPlatformAdmin: vi.fn().mockResolvedValue(false),
  isSuperAdmin: vi.fn().mockReturnValue(false),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  resolveWorkspaceAccess: vi.fn(),
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn().mockReturnValue(false),
  getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
  getAllWorkspaceMembers: vi.fn(),
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
}))

vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: mocks.isPlatformAdmin,
  isSuperAdmin: mocks.isSuperAdmin,
  isWorkspaceScheduledForDeletion: mocks.isWorkspaceScheduledForDeletion,
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess,
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: () => undefined,
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mocks.findOrFail,
  isDatabaseError: mocks.isDatabaseError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  userModel: {},
}))

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: mocks.getAllWorkspaceMembers,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: mocks.checkWorkspaceOwnerAccess,
  workspaceAccessDenialException: (reason: string) => new Error(reason),
}))

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" }),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn() },
}))

const { workspaceActionClientAllowExpired } = await import("@/lib/safe-action")
const { workspaceIdrequestParams } = await import("@/features/common/schema")

const user = { id: "user-1", mustChangePassword: false }

function buildProbeAction() {
  return workspaceActionClientAllowExpired
    .bindArgsSchemas(workspaceIdrequestParams)
    .action(async ({ ctx }: { ctx: Record<string, unknown> }) => ctx)
}

async function callProbeAction(workspaceId: string) {
  const action = buildProbeAction()
  return await (
    action as unknown as (
      workspaceId: string,
      input: unknown,
    ) => Promise<{ data?: Record<string, unknown>; serverError?: string }>
  )(workspaceId, undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isPlatformAdmin.mockResolvedValue(false)
  mocks.isSuperAdmin.mockReturnValue(false)
  mocks.isWorkspaceScheduledForDeletion.mockReturnValue(false)
  mocks.isDatabaseError.mockReturnValue(false)
  mocks.getCurrentUserId.mockResolvedValue("user-1")
  mocks.findOrFail.mockResolvedValue(user)
  mocks.getAllWorkspaceMembers.mockResolvedValue({
    workspaceMembers: [],
    workspaces: [],
  })
  mocks.checkWorkspaceOwnerAccess.mockResolvedValue(null)
})

describe("workspaceActionClientAllowExpired — platform support access", () => {
  test("exposes isSupportSession: true and full permissions for a super admin on a support-enabled workspace", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { superAdmin: true } },
      isSupportSession: true,
    })

    const result = await callProbeAction("123")

    expect(result.data).toMatchObject({
      workspaceId: "123",
      isSupportSession: true,
      workspaceMemberPermissions: { superAdmin: true },
    })
  })

  test("exposes isSupportSession: false for a real member", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { superAdmin: false } },
      isSupportSession: false,
    })

    const result = await callProbeAction("123")

    expect(result.data).toMatchObject({ isSupportSession: false })
  })

  test("fails when resolveWorkspaceAccess finds no access (non-admin, support disabled)", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(undefined)

    const result = await callProbeAction("123")

    expect(result.data).toBeUndefined()
    expect(result.serverError).toBeDefined()
  })
})
