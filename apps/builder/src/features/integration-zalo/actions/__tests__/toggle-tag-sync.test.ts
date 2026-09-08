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
// zodBigintAsString() returns z.string(), so IDs passed as bind args and parsed
// by the middleware are plain strings.
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

// IDs are strings (zodBigintAsString parses to string, not BigInt)
const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/client — findOrFail is still reached by the
// workspaceActionClient auth chain, even though the action itself no longer
// calls `db` directly.
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business (isPlatformAdmin, zaloIntegrationService) and errors
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
  zaloIntegrationService: { updateTagSync },
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
const { toggleZaloTagSyncAction } = await import("../toggle-tag-sync.action")
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
// ---------------------------------------------------------------------------
function invokeAction(enabled: boolean) {
  const boundAction = toggleZaloTagSyncAction.bind(
    null,
    WORKSPACE_ID,
    INTEGRATION_ID,
  )
  return boundAction({ enabled })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("toggleZaloTagSyncAction", () => {
  beforeEach(() => {
    // Re-wire auth mocks (clearMocks: true wipes implementations between tests)
    getCurrentUserIdMock.mockResolvedValue("user-1")
    findOrFailMock.mockResolvedValue({ id: "user-1", name: "Test User" })
    getAllWorkspaceMembersMock.mockResolvedValue({
      workspaces: [{ id: WORKSPACE_ID }],
      workspaceMembers: [{ workspaceId: WORKSPACE_ID, permissions: {} }],
      workspaceIds: [WORKSPACE_ID],
    })

    updateTagSync.mockResolvedValue(undefined)
  })

  // ── enabled: true ──────────────────────────────────────────────────────────

  describe("enabled: true", () => {
    test("calls zaloIntegrationService.updateTagSync with a truthy enabled flag", async () => {
      await invokeAction(true)

      expect(updateTagSync).toHaveBeenCalledTimes(1)
      expect(updateTagSync).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        integrationId: INTEGRATION_ID,
        enabled: true,
      })
    })

    test("calls invalidateCacheByTags with the workspace-scoped zalo key", async () => {
      await invokeAction(true)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledTimes(1)
      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#zalos`,
      ])
    })
  })

  // ── enabled: false ─────────────────────────────────────────────────────────

  describe("enabled: false", () => {
    test("calls zaloIntegrationService.updateTagSync with a falsy enabled flag", async () => {
      await invokeAction(false)

      expect(updateTagSync).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        integrationId: INTEGRATION_ID,
        enabled: false,
      })
    })

    test("calls invalidateCacheByTags with the workspace-scoped zalo key", async () => {
      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#zalos`,
      ])
    })
  })

  // ── no matching row (no-op) ────────────────────────────────────────────────
  // The service's update is a no-op at DB level when no row matches; the
  // action still completes without throwing.

  describe("no matching row (no-op)", () => {
    test("returns void (undefined data) without throwing", async () => {
      updateTagSync.mockResolvedValue(undefined)

      const result = await invokeAction(true)

      // toggleZaloTagSyncAction has no explicit return value → result.data is undefined
      expect(result?.serverError).toBeUndefined()
    })

    test("still calls invalidateCacheByTags even when no row was updated", async () => {
      updateTagSync.mockResolvedValue(undefined)

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#zalos`,
      ])
    })
  })
})
