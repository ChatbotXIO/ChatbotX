import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUserAndAllLinkedWorkspaces: vi.fn(),
  ensureFirstWorkspace: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: vi.fn(async () => "1"),
}))
vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(async () => false),
  isSuperAdmin: vi.fn(async () => false),
  quotaEnforcementService: {},
  userQuotaService: {},
}))
vi.mock("@chatbotx.io/database/schema", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { name: string }) =>
    `${key}:${values?.name}`,
}))
vi.mock("@/components/expired-banner", () => ({ ExpiredBanner: () => null }))
vi.mock("@/components/workspace-deletion-pending-toast", () => ({
  WorkspaceDeletionPendingToast: () => null,
}))
vi.mock("@/env", () => ({ isCloud: () => false }))
vi.mock("@/features/workspaces/components/account-rail", () => ({
  AccountRail: () => null,
}))
vi.mock("@/features/workspaces/components/deleted-workspaces", () => ({
  DeletedWorkspaces: () => null,
}))
vi.mock("@/features/workspaces/components/workspaces-list", () => ({
  default: () => null,
}))
vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: () => false,
}))
vi.mock("@/lib/auth/require-password-current", () => ({
  enforcePasswordCurrent: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndAllLinkedWorkspaces:
    mocks.getCurrentUserAndAllLinkedWorkspaces,
}))
vi.mock("@/lib/domain", () => ({ getDomainFromHeader: async () => "host" }))
vi.mock("@/lib/quota-metrics", () => ({
  buildQuotaMetrics: () => [],
  resolveBlockReason: () => null,
  resolveTrialEndsAt: () => null,
}))
vi.mock("@/lib/workspace/create-first-workspace", () => ({
  ensureFirstWorkspace: mocks.ensureFirstWorkspace,
}))

const { default: MainPage } = await import("../src/app/page")

const user = {
  id: "user-1",
  name: "Ann",
  email: "ann@example.com",
  image: null,
}

function linked(members: unknown[]) {
  mocks.getCurrentUserAndAllLinkedWorkspaces.mockResolvedValue({
    user,
    allWorkspaces: [],
    allWorkspaceMembers: members,
  })
}

describe("MainPage default workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("creates a named workspace and redirects into it when the user has no membership", async () => {
    linked([])
    mocks.ensureFirstWorkspace.mockResolvedValue({ id: "ws-new" })

    await expect(MainPage()).rejects.toThrow("redirect:/space/ws-new/dashboard")
    expect(mocks.ensureFirstWorkspace).toHaveBeenCalledWith("user-1", {
      name: "defaultName:Ann",
    })
  })

  test("falls back to the list instead of redirecting when the plan blocks creation", async () => {
    linked([])
    mocks.ensureFirstWorkspace.mockResolvedValue(null)

    await expect(MainPage()).resolves.toBeDefined()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  test("does not create a workspace for an invited user who already has a membership", async () => {
    linked([
      {
        role: "agent",
        permissions: {},
        workspace: { id: "ws-invited" },
      },
    ])

    await expect(MainPage()).resolves.toBeDefined()
    expect(mocks.ensureFirstWorkspace).not.toHaveBeenCalled()
  })
})
