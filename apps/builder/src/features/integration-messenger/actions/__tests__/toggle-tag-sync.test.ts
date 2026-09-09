// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock next/cache
// ---------------------------------------------------------------------------
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/redis — intercept invalidateCacheByTags calls
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock auth utilities so workspaceActionClient never touches Next.js headers()
// zodBigintAsString() returns z.string(), so workspaceId parsed from bind arg
// is a plain string.  The workspace mock must use string ids to match.
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

// Workspace IDs as strings (zodBigintAsString returns string, not BigInt)
const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/client — findOrFail is still reached by the
// workspaceActionClient auth chain.
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business (isPlatformAdmin, messengerIntegrationService) and errors
//
// This factory mock enumerates exports, so it must cover everything
// `workspaceActionClient` reaches — not just what this action calls directly.
// A missing symbol becomes `undefined`, the middleware throws a TypeError, and
// next-safe-action swallows it into a generic `serverError`, which reads like an
// unrelated failure. `isWorkspaceScheduledForDeletion` is the deletion gate in
// `lib/safe-action.ts`; `false` = an active workspace, this action's precondition.
// ---------------------------------------------------------------------------
const updateTagSync = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(async () => false),
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  resolveWorkspaceAccess: vi.fn(({ realMember, workspaceId }) => {
    if (!realMember) {
      return
    }
    return {
      workspace: realMember.workspace ?? { id: workspaceId },
      member: realMember,
      isSupportSession: false,
    }
  }),
  messengerIntegrationService: { updateTagSync },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: vi.fn(() => undefined),
  withAuditContext: vi.fn(
    async (_ctx: unknown, fn: () => Promise<unknown>) => await fn(),
  ),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/sdk (SdkException referenced in safe-action error handler)
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

// ---------------------------------------------------------------------------
// Mock logger to suppress output
// ---------------------------------------------------------------------------
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Lazy imports — must come after all vi.mock() calls
// ---------------------------------------------------------------------------
const { toggleMessengerTagSyncAction } = await import(
  "../toggle-tag-sync.action"
)
const { invalidateCacheByTags } = await import("@chatbotx.io/redis")
const { findOrFail } = await import("@chatbotx.io/database/client")
const { getCurrentUserId } = await import("@/lib/auth/utils")
const { getAllWorkspaceMembers } = await import(
  "@/features/workspace-members/queries"
)

const invalidateCacheByTagsMock = invalidateCacheByTags as ReturnType<
  typeof vi.fn
>
const findOrFailMock = findOrFail as ReturnType<typeof vi.fn>
const getCurrentUserIdMock = getCurrentUserId as ReturnType<typeof vi.fn>
const getAllWorkspaceMembersMock = getAllWorkspaceMembers as ReturnType<
  typeof vi.fn
>

// ---------------------------------------------------------------------------
// Helper: invoke the bound action
// workspaceActionClient.bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
// → bind args are string representations of the IDs
// ---------------------------------------------------------------------------
function invokeAction(enabled: boolean) {
  const boundAction = toggleMessengerTagSyncAction.bind(
    null,
    WORKSPACE_ID,
    INTEGRATION_ID,
  )
  return boundAction({ enabled })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("toggleMessengerTagSyncAction", () => {
  beforeEach(() => {
    // Re-wire auth mocks (clearMocks: true wipes implementations between tests)
    getCurrentUserIdMock.mockResolvedValue("user-1")
    findOrFailMock.mockResolvedValue({ id: "user-1", name: "Test User" })
    getAllWorkspaceMembersMock.mockResolvedValue({
      workspaces: [{ id: WORKSPACE_ID }],
      workspaceMembers: [{ workspaceId: WORKSPACE_ID, permissions: {} }],
      workspaceIds: [WORKSPACE_ID],
    })

    updateTagSync.mockResolvedValue(null)
  })

  // ── enabled: true ──────────────────────────────────────────────────────────

  describe("enabled: true", () => {
    test("returns the Date instance from the service (not null)", async () => {
      const now = new Date()
      updateTagSync.mockResolvedValue(now)

      const result = await invokeAction(true)

      expect(updateTagSync).toHaveBeenCalledTimes(1)
      expect(updateTagSync).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        integrationId: INTEGRATION_ID,
        enabled: true,
      })
      expect(result?.data?.syncTagEnabledAt).toBeInstanceOf(Date)
    })

    test("calls invalidateCacheByTags with the workspace-scoped messenger key", async () => {
      updateTagSync.mockResolvedValue(new Date())

      await invokeAction(true)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledTimes(1)
      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })

  // ── enabled: false ─────────────────────────────────────────────────────────

  describe("enabled: false", () => {
    test("passes enabled: false to the service", async () => {
      updateTagSync.mockResolvedValue(null)

      await invokeAction(false)

      expect(updateTagSync).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        integrationId: INTEGRATION_ID,
        enabled: false,
      })
    })

    test("calls invalidateCacheByTags with the workspace-scoped messenger key", async () => {
      updateTagSync.mockResolvedValue(null)

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })

  // ── no matching row ────────────────────────────────────────────────────────

  describe("no matching row (service returns null)", () => {
    test("returns { syncTagEnabledAt: null } without throwing", async () => {
      updateTagSync.mockResolvedValue(null)

      const result = await invokeAction(true)

      expect(result?.data?.syncTagEnabledAt).toBeNull()
    })

    test("still calls invalidateCacheByTags even when no row was updated", async () => {
      updateTagSync.mockResolvedValue(null)

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })
})
