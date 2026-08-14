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

// IDs are strings (zodBigintAsString parses to string, not BigInt)
const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/client
// Zalo action does NOT call .returning(), so the chainable builder only needs
// update → set → where.
// ---------------------------------------------------------------------------
const dbUpdateBuilder = {
  set: vi.fn(),
  where: vi.fn(),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: vi.fn(),
  },
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn(() => false),
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/schema
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/database/schema", () => ({
  integrationZaloModel: {
    id: "id",
    workspaceId: "workspaceId",
    syncTagEnabledAt: "syncTagEnabledAt",
  },
  userModel: { id: "id" },
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business (isPlatformAdmin) and errors
//
// This factory mock enumerates exports, so it must cover everything
// `workspaceActionClient` reaches — not just what this action calls directly.
// A missing symbol becomes `undefined`, the middleware throws a TypeError, and
// next-safe-action swallows it into a generic `serverError`, which reads like an
// unrelated failure. `isWorkspaceScheduledForDeletion` is the deletion gate in
// `lib/safe-action.ts`; `false` = an active workspace, this action's precondition.
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(async () => false),
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
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
const { db, findOrFail } = await import("@chatbotx.io/database/client")
const { getCurrentUserId } = await import("@/lib/auth/utils")
const { getAllWorkspaceMembers } = await import(
  "@/features/workspace-members/queries"
)

const invalidateCacheByTagsMock = invalidateCacheByTags as ReturnType<
  typeof vi.fn
>
const dbUpdate = db.update as ReturnType<typeof vi.fn>
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

    // Re-wire the chainable DB builder (Zalo action: update().set().where())
    dbUpdateBuilder.set.mockReturnValue(dbUpdateBuilder)
    // where() must resolve to a promise since the action awaits the chain
    dbUpdateBuilder.where.mockResolvedValue(undefined)
    dbUpdate.mockReturnValue(dbUpdateBuilder)
  })

  // ── enabled: true ──────────────────────────────────────────────────────────

  describe("enabled: true", () => {
    test("sets syncTagEnabledAt to a Date instance (not null)", async () => {
      await invokeAction(true)

      expect(dbUpdate).toHaveBeenCalledTimes(1)

      const setArg = dbUpdateBuilder.set.mock.calls[0]?.[0] as {
        syncTagEnabledAt: unknown
      }
      expect(setArg.syncTagEnabledAt).toBeInstanceOf(Date)
      expect(setArg.syncTagEnabledAt).not.toBeNull()
    })

    test("scopes the WHERE clause by both workspaceId and integrationId", async () => {
      await invokeAction(true)

      expect(dbUpdateBuilder.where).toHaveBeenCalledTimes(1)
      // and() mock returns [...args], so the array has two eq() calls
      const whereArg = dbUpdateBuilder.where.mock.calls[0]?.[0] as unknown[]
      expect(Array.isArray(whereArg)).toBe(true)
      expect(whereArg).toHaveLength(2)
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
    test("sets syncTagEnabledAt to null", async () => {
      await invokeAction(false)

      const setArg = dbUpdateBuilder.set.mock.calls[0]?.[0] as {
        syncTagEnabledAt: unknown
      }
      expect(setArg.syncTagEnabledAt).toBeNull()
    })

    test("calls invalidateCacheByTags with the workspace-scoped zalo key", async () => {
      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#zalos`,
      ])
    })

    test("scopes the WHERE clause by both workspaceId and integrationId", async () => {
      await invokeAction(false)

      const whereArg = dbUpdateBuilder.where.mock.calls[0]?.[0] as unknown[]
      expect(Array.isArray(whereArg)).toBe(true)
      expect(whereArg).toHaveLength(2)
    })
  })

  // ── no matching row (no-op) ────────────────────────────────────────────────
  // Zalo action does NOT use .returning() — it returns void.
  // When no row matches, the update is a no-op at DB level; the action still
  // completes without throwing.

  describe("no matching row (no-op)", () => {
    test("returns void (undefined data) without throwing", async () => {
      // where() resolves to undefined (no rows affected) — action returns void
      dbUpdateBuilder.where.mockResolvedValue(undefined)

      const result = await invokeAction(true)

      // toggleZaloTagSyncAction has no explicit return value → result.data is undefined
      expect(result?.serverError).toBeUndefined()
    })

    test("still calls invalidateCacheByTags even when no row was updated", async () => {
      dbUpdateBuilder.where.mockResolvedValue(undefined)

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#zalos`,
      ])
    })
  })
})
