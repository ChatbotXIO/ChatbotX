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
  logger: { error: vi.fn(), warn: vi.fn() },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { callingActionClient, callingAdminActionClient } = await import(
  "@/lib/safe-action"
)
const { workspaceIdrequestParams } = await import("@/features/common/schema")

const user = { id: "user-1", mustChangePassword: false }

/**
 * A minimal structural view of either client, just enough to build a probe
 * action — `callingActionClient` and `callingAdminActionClient` have
 * different `.use()`-accumulated ctx types, and a union of their full types
 * is not callable (their `bindArgsSchemas` overload sets don't merge). The
 * probe action itself only reads `ctx`, so this narrower shape is enough.
 */
type ProbeClient = {
  bindArgsSchemas: (schemas: typeof workspaceIdrequestParams) => {
    action: (
      handler: (args: { ctx: Record<string, unknown> }) => Promise<unknown>,
    ) => unknown
  }
}

function buildProbeAction(client: ProbeClient) {
  return client
    .bindArgsSchemas(workspaceIdrequestParams)
    .action(async ({ ctx }: { ctx: Record<string, unknown> }) => ctx)
}

async function callProbeAction(client: ProbeClient, workspaceId: string) {
  const action = buildProbeAction(client)
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

function mockAccess(input: {
  isSupportSession: boolean
  permissions: Record<string, boolean>
}) {
  mocks.resolveWorkspaceAccess.mockResolvedValue({
    workspace: { id: "123", ownerId: "owner-1" },
    member: { permissions: input.permissions },
    isSupportSession: input.isSupportSession,
  })
}

describe("callingActionClient — P2 item 7 gates", () => {
  test("rejects a support session even with full permissions, with the translated support-session-blocked message", async () => {
    mockAccess({ isSupportSession: true, permissions: { superAdmin: true } })

    const result = await callProbeAction(callingActionClient, "123")

    expect(result.data).toBeUndefined()
    expect(result.serverError).toBe(
      "whatsapp.calls.errors.supportSessionCallingBlocked",
    )
  })

  test("rejects a real member with no contacts access, with the translated calling-access-denied message", async () => {
    mockAccess({ isSupportSession: false, permissions: {} })

    const result = await callProbeAction(callingActionClient, "123")

    expect(result.data).toBeUndefined()
    expect(result.serverError).toBe("whatsapp.calls.errors.callingAccessDenied")
  })

  test("allows a member with onlyAssignedContacts (contacts-access rule)", async () => {
    mockAccess({
      isSupportSession: false,
      permissions: { onlyAssignedContacts: true },
    })

    const result = await callProbeAction(callingActionClient, "123")

    expect(result.data).toMatchObject({ workspaceId: "123" })
  })

  test("allows a superAdmin member (contacts-access rule bypass)", async () => {
    mockAccess({ isSupportSession: false, permissions: { superAdmin: true } })

    const result = await callProbeAction(callingActionClient, "123")

    expect(result.data).toMatchObject({ workspaceId: "123" })
  })
})

describe("callingAdminActionClient — P2 item 7 gates", () => {
  test("rejects a support session, with the translated support-session-blocked message", async () => {
    mockAccess({ isSupportSession: true, permissions: { superAdmin: true } })

    const result = await callProbeAction(callingAdminActionClient, "123")

    expect(result.data).toBeUndefined()
    expect(result.serverError).toBe(
      "whatsapp.calls.errors.supportSessionCallingBlocked",
    )
  })

  test("does NOT require contacts access by itself (each admin action keeps its own assertWorkspaceSuperAdmin)", async () => {
    mockAccess({ isSupportSession: false, permissions: {} })

    const result = await callProbeAction(callingAdminActionClient, "123")

    expect(result.data).toMatchObject({ workspaceId: "123" })
  })
})
