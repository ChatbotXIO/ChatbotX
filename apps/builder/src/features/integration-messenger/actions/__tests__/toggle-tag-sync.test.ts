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

// Workspace IDs as strings (zodBigintAsString returns string, not BigInt)
const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/client
// Chainable builder: db.update(model).set(…).where(…).returning()
// ---------------------------------------------------------------------------
const returningResult: { current: { syncTagEnabledAt: Date | null }[] } = {
  current: [],
}

const dbUpdateBuilder = {
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
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
  integrationMessengerModel: {
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
const { toggleMessengerTagSyncAction } = await import(
  "../toggle-tag-sync.action"
)
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

    // Re-wire the chainable DB builder
    dbUpdateBuilder.set.mockReturnValue(dbUpdateBuilder)
    dbUpdateBuilder.where.mockReturnValue(dbUpdateBuilder)
    dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)
    dbUpdate.mockReturnValue(dbUpdateBuilder)
  })

  // ── enabled: true ──────────────────────────────────────────────────────────

  describe("enabled: true", () => {
    test("sets syncTagEnabledAt to a Date instance (not null)", async () => {
      const now = new Date()
      returningResult.current = [{ syncTagEnabledAt: now }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      const result = await invokeAction(true)

      expect(dbUpdate).toHaveBeenCalledTimes(1)

      const setArg = dbUpdateBuilder.set.mock.calls[0]?.[0] as {
        syncTagEnabledAt: unknown
      }
      expect(setArg.syncTagEnabledAt).toBeInstanceOf(Date)
      expect(setArg.syncTagEnabledAt).not.toBeNull()

      // Return value exposes syncTagEnabledAt from the DB row
      expect(result?.data?.syncTagEnabledAt).toBeInstanceOf(Date)
    })

    test("scopes the WHERE clause by both workspaceId and integrationId", async () => {
      returningResult.current = [{ syncTagEnabledAt: new Date() }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(true)

      expect(dbUpdateBuilder.where).toHaveBeenCalledTimes(1)
      // Our and() mock spreads its args into an array — the array should contain
      // exactly two eq() predicate results (one per field).
      const whereArg = dbUpdateBuilder.where.mock.calls[0]?.[0] as unknown[]
      expect(Array.isArray(whereArg)).toBe(true)
      expect(whereArg).toHaveLength(2)
    })

    test("calls invalidateCacheByTags with the workspace-scoped messenger key", async () => {
      returningResult.current = [{ syncTagEnabledAt: new Date() }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(true)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledTimes(1)
      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })

  // ── enabled: false ─────────────────────────────────────────────────────────

  describe("enabled: false", () => {
    test("sets syncTagEnabledAt to null", async () => {
      returningResult.current = [{ syncTagEnabledAt: null }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(false)

      const setArg = dbUpdateBuilder.set.mock.calls[0]?.[0] as {
        syncTagEnabledAt: unknown
      }
      expect(setArg.syncTagEnabledAt).toBeNull()
    })

    test("calls invalidateCacheByTags with the workspace-scoped messenger key", async () => {
      returningResult.current = [{ syncTagEnabledAt: null }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })

    test("scopes the WHERE clause by both workspaceId and integrationId", async () => {
      returningResult.current = [{ syncTagEnabledAt: null }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(false)

      const whereArg = dbUpdateBuilder.where.mock.calls[0]?.[0] as unknown[]
      expect(Array.isArray(whereArg)).toBe(true)
      expect(whereArg).toHaveLength(2)
    })
  })

  // ── no matching row ────────────────────────────────────────────────────────

  describe("no matching row (returning empty array)", () => {
    test("returns { syncTagEnabledAt: null } without throwing", async () => {
      returningResult.current = []
      dbUpdateBuilder.returning.mockResolvedValue([])

      const result = await invokeAction(true)

      // updated[0] is undefined → falls back to null via `?? null`
      expect(result?.data?.syncTagEnabledAt).toBeNull()
    })

    test("still calls invalidateCacheByTags even when no row was updated", async () => {
      returningResult.current = []
      dbUpdateBuilder.returning.mockResolvedValue([])

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })
})
