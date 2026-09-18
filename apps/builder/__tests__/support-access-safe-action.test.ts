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
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}))

const { callHistoryActionClient, workspaceActionClientAllowExpired } =
  await import("@/lib/safe-action")
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

function buildCallHistoryProbeAction() {
  return callHistoryActionClient
    .bindArgsSchemas(workspaceIdrequestParams)
    .action(async ({ ctx }: { ctx: Record<string, unknown> }) => ctx)
}

async function callCallHistoryProbeAction(workspaceId: string) {
  const action = buildCallHistoryProbeAction()
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

  // M4: `ctx.userId` was dropped — every consumer (the P5 call-artifact
  // actions, `listWhatsappCallsAction`) reads `ctx.user.id` instead, the
  // same field `authActionClient` already exposes to every other action.
  test("does not expose a redundant ctx.userId — ctx.user.id is the one place the caller's id lives", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { superAdmin: true } },
      isSupportSession: true,
    })

    const result = await callProbeAction("123")

    expect(result.data?.userId).toBeUndefined()
    expect(result.data?.user).toMatchObject({ id: "user-1" })
  })

  // C1/D8: `workspaceActionClientAllowExpired` is the read client every P5
  // call-artifact action AND the Calls page/history action are built on —
  // it must never call the owner-quota/expiry gate
  // (`checkWorkspaceOwnerAccess`, which only `workspaceActionClient` layers
  // on top). A support session or an expired/owner-blocked workspace must
  // both still be able to read call history and artifacts.
  test("never runs the owner-quota/expiry gate — a read succeeds for an expired/owner-blocked workspace", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { contacts: true } },
      isSupportSession: false,
    })
    // If this middleware ever called the gate, a denial here would surface
    // as a thrown/serverError result instead of a successful read.
    mocks.checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const result = await callProbeAction("123")

    expect(mocks.checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({ workspaceId: "123" })
    expect(result.serverError).toBeUndefined()
  })
})

// H2 (plan P5 item 3/6): `callHistoryActionClient` gates the Calls page's
// list action on `hasContactsAccess || analytics` (D4) — distinct from
// `requireContactsAccess`, which admits only `contacts`/`onlyAssignedContacts`
// and would wrongly shut out an analytics-only viewer from call history.
describe("callHistoryActionClient — requireCallHistoryAccess gate (plan D4)", () => {
  test("allows a contacts member", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { contacts: true } },
      isSupportSession: false,
    })

    const result = await callCallHistoryProbeAction("123")

    expect(result.data).toMatchObject({ workspaceId: "123" })
    expect(result.serverError).toBeUndefined()
  })

  test("allows an analytics-only member (no calling access, but call-history read access)", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { analytics: true } },
      isSupportSession: false,
    })

    const result = await callCallHistoryProbeAction("123")

    expect(result.data).toMatchObject({ workspaceId: "123" })
    expect(result.serverError).toBeUndefined()
  })

  test("denies a member with neither contacts/onlyAssignedContacts nor analytics", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: {} },
      isSupportSession: false,
    })

    const result = await callCallHistoryProbeAction("123")

    expect(result.data).toBeUndefined()
    expect(result.serverError).toBeDefined()
  })

  test("allows a platform support session's synthetic superAdmin membership (read access, unaffected by D8)", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { superAdmin: true } },
      isSupportSession: true,
    })

    const result = await callCallHistoryProbeAction("123")

    expect(result.data).toMatchObject({
      workspaceId: "123",
      isSupportSession: true,
    })
    expect(result.serverError).toBeUndefined()
  })

  // C1/D8: built on `workspaceActionClientAllowExpired`, so it must never
  // run the owner-quota/expiry gate — history stays readable for an
  // expired/owner-blocked workspace.
  test("never runs the owner-quota/expiry gate for an expired/owner-blocked workspace", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      workspace: { id: "123", ownerId: "owner-1" },
      member: { permissions: { contacts: true } },
      isSupportSession: false,
    })
    mocks.checkWorkspaceOwnerAccess.mockResolvedValue("trialExpired")

    const result = await callCallHistoryProbeAction("123")

    expect(mocks.checkWorkspaceOwnerAccess).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({ workspaceId: "123" })
    expect(result.serverError).toBeUndefined()
  })
})
