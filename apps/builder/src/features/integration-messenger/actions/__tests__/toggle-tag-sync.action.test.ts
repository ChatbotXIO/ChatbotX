// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// 1. Mock next/cache
// ---------------------------------------------------------------------------
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}))

// ---------------------------------------------------------------------------
// 2. Mock @chatbotx.io/redis
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

// ---------------------------------------------------------------------------
// 3. Mock auth chain so workspaceActionClient never calls Next.js headers()
//    - getCurrentUserId  → returns fake user id
//    - findOrFail        → returns fake user row
//    - getAllWorkspaceMembers → returns fake workspace matching our workspaceId
//
//    NOTE: zodBigintAsString() returns z.string(), so workspace IDs passed
//    through bindArgs are plain strings — the mock workspace id must also
//    be a string so the find() comparison works.
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(),
}))

const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

// ---------------------------------------------------------------------------
// 4. Mock @chatbotx.io/database/client
//    - findOrFail  → used by authActionClient to load the user row
//    - db.update chainable builder
//    - and / eq   → passthrough predicates
//    - isDatabaseError → required by safe-action handleServerError
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
// 5. Mock @chatbotx.io/database/schema (messenger model object)
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
// 6. Mock @chatbotx.io/business (symbols used by safe-action)
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

// ---------------------------------------------------------------------------
// 6b. Mock @chatbotx.io/business/errors (ChatbotXException used in safe-action)
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

// ---------------------------------------------------------------------------
// 7. Mock @chatbotx.io/sdk (SdkException used in safe-action handleServerError)
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

// ---------------------------------------------------------------------------
// 8. Mock next-safe-action logger dep (pino or similar)
// ---------------------------------------------------------------------------
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Lazy imports after all vi.mock() calls
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

// Helper: invoke the action with bound args (workspaceId, integrationId)
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
    // Re-wire all mocks (clearMocks: true wipes implementations between tests)
    getCurrentUserIdMock.mockResolvedValue("user-1")
    findOrFailMock.mockResolvedValue({ id: "user-1", name: "Test User" })
    getAllWorkspaceMembersMock.mockResolvedValue({
      workspaces: [{ id: WORKSPACE_ID }],
      workspaceMembers: [],
      workspaceIds: [WORKSPACE_ID],
    })
    dbUpdateBuilder.set.mockReturnValue(dbUpdateBuilder)
    dbUpdateBuilder.where.mockReturnValue(dbUpdateBuilder)
    dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)
    dbUpdate.mockReturnValue(dbUpdateBuilder)
  })

  describe("enabled: true", () => {
    test("sets syncTagEnabledAt to a Date (not null)", async () => {
      const now = new Date()
      returningResult.current = [{ syncTagEnabledAt: now }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      const result = await invokeAction(true)

      // The action should call db.update
      expect(dbUpdate).toHaveBeenCalledTimes(1)

      // .set() must receive syncTagEnabledAt that is a Date
      const setCall = dbUpdateBuilder.set.mock.calls[0]?.[0] as {
        syncTagEnabledAt: unknown
      }
      expect(setCall.syncTagEnabledAt).toBeInstanceOf(Date)
      expect(setCall.syncTagEnabledAt).not.toBeNull()

      // The action's return value should expose syncTagEnabledAt
      expect(result?.data?.syncTagEnabledAt).toBeInstanceOf(Date)
    })

    test("scopes the where clause by workspaceId AND integrationId", async () => {
      returningResult.current = [{ syncTagEnabledAt: new Date() }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(true)

      // .where() is called once; args are the and(eq(id, integrationId), eq(workspaceId, workspaceId)) tuple
      expect(dbUpdateBuilder.where).toHaveBeenCalledTimes(1)
      const whereArg = dbUpdateBuilder.where.mock.calls[0]?.[0] as unknown[]
      // and() mock returns [...args], so whereArg is an array of two eq() calls
      expect(Array.isArray(whereArg)).toBe(true)
      expect(whereArg).toHaveLength(2)
    })

    test("calls invalidateCacheByTags with the messenger cache key", async () => {
      returningResult.current = [{ syncTagEnabledAt: new Date() }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(true)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledTimes(1)
      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })

  describe("enabled: false", () => {
    test("sets syncTagEnabledAt to null", async () => {
      returningResult.current = [{ syncTagEnabledAt: null }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(false)

      const setCall = dbUpdateBuilder.set.mock.calls[0]?.[0] as {
        syncTagEnabledAt: unknown
      }
      expect(setCall.syncTagEnabledAt).toBeNull()
    })

    test("calls invalidateCacheByTags with the messenger cache key", async () => {
      returningResult.current = [{ syncTagEnabledAt: null }]
      dbUpdateBuilder.returning.mockResolvedValue(returningResult.current)

      await invokeAction(false)

      expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
        `workspaces:${WORKSPACE_ID}#messengers`,
      ])
    })
  })

  describe("no matching row (returning empty array)", () => {
    test("returns syncTagEnabledAt: null without throwing", async () => {
      returningResult.current = []
      dbUpdateBuilder.returning.mockResolvedValue([])

      const result = await invokeAction(true)

      // Should not throw; data.syncTagEnabledAt falls back to null
      expect(result?.data?.syncTagEnabledAt).toBeNull()
    })
  })
})
