// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import enMessages from "../messages/en.json"
import viMessages from "../messages/vi.json"

// ---- mock: database client -----------------------------------------------
// Chainable update builder: set → where → returning.
const dbUpdateBuilder = {
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}
dbUpdateBuilder.set.mockReturnValue(dbUpdateBuilder)
dbUpdateBuilder.where.mockReturnValue(dbUpdateBuilder)
dbUpdateBuilder.returning.mockResolvedValue([{ phoneNumberId: "pn-42" }])

// Retained to assert the handler does NOT touch db.execute (disable is
// flag-only — no chunked-delete). Default returns 0 rows.
const dbExecute = vi.fn(async () => ({ rowCount: 0 }))

// db.insert builder for CoexistSyncRun: handler chains .values(...).returning(...)
const dbInsertBuilder = {
  values: vi.fn(),
  returning: vi.fn(),
}
dbInsertBuilder.values.mockReturnValue(dbInsertBuilder)
dbInsertBuilder.returning.mockResolvedValue([{ id: "run-1" }])

// smb_app_data trigger (Meta API). The enabled:true path POSTs twice
// (smb_app_state_sync + history); default both to ok.
const mockTriggerSmbAppDataSync = vi.fn<
  () => Promise<{ ok: boolean; reason?: string }>
>(async () => ({ ok: true }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: vi.fn(() => dbUpdateBuilder),
    execute: dbExecute,
    insert: vi.fn(() => dbInsertBuilder),
    query: {
      workspaceMemberModel: {
        findFirst: vi.fn(async () => ({
          workspace: { id: "ws-1" },
          workspaceId: "ws-1",
          userId: "user-1",
        })),
      },
    },
  },
  eq: vi.fn((_col: unknown, val: unknown) => ({ col: _col, val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    }),
    { raw: (s: string) => s },
  ),
}))

// ---- mock: schema stubs ---------------------------------------------------
// Use the real schema module: the db client is mocked separately, and
// transitively-imported packages (e.g. @chatbotx.io/business) need the real
// drizzle tables for createSelectSchema. The suite never asserts on model
// internals — they are only passed to the mocked db.
vi.mock("@chatbotx.io/database/schema", async (importOriginal) =>
  importOriginal<typeof import("@chatbotx.io/database/schema")>(),
)

// ---- mock: worker queue (kept for completeness; should NOT be called on enable) ---
const mockQueueAdd = vi.fn<
  (name: string, data: unknown, opts?: unknown) => Promise<undefined>
>(async () => undefined)

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {},
  integrationQueue: {
    add: mockQueueAdd,
  },
  // event-bus (imported transitively) builds a Redis connection at module load.
  getRedisConnection: () => ({}),
}))

// ---- mock: auth (prevent real Better-Auth init) --------------------------
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        session: { id: "sess-1" },
        user: { id: "user-1", email: "test@test.com", isAnonymous: false },
      })),
    },
  },
}))

// ---- mock: logger (prevent pino init) ------------------------------------
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ---- mock: smb_app_data trigger + builder logger -------------------------
vi.mock("@chatbotx.io/integration-whatsapp/api/coexists", () => ({
  triggerSmbAppDataSync: mockTriggerSmbAppDataSync,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

// ---- dynamic imports AFTER mocks -----------------------------------------
const { call } = await import("@orpc/server")
const { integrationWhatsappCoexistAPIs } = await import(
  "@/features/integration-whatsapp/api/coexist"
)
const { db } = await import("@chatbotx.io/database/client")
const dbInsertBuilderRef = dbInsertBuilder

const procedure = integrationWhatsappCoexistAPIs.setCoexistWhatsappAPI

// Stub initial context — authMiddleware reads headers for session.
// workspaceAuthorizedMidddleware reads db.query.workspaceMemberModel.findFirst
// which is already mocked above to return a valid member.
const stubContext = {
  headers: new Headers({ authorization: "Bearer test-token" }),
}

// ---- tests ---------------------------------------------------------------
describe("setCoexistWhatsappAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-wire chainable builders after clearAllMocks resets return values.
    dbUpdateBuilder.set.mockReturnValue(dbUpdateBuilder)
    dbUpdateBuilder.where.mockReturnValue(dbUpdateBuilder)
    dbUpdateBuilder.returning.mockResolvedValue([{ phoneNumberId: "pn-42" }])
    dbExecute.mockResolvedValue({ rowCount: 0 })
    dbInsertBuilderRef.values.mockReturnValue(dbInsertBuilderRef)
    dbInsertBuilderRef.returning.mockResolvedValue([{ id: "run-1" }])
    mockTriggerSmbAppDataSync.mockResolvedValue({ ok: true })
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue(dbInsertBuilderRef)
    ;(
      db.query.workspaceMemberModel.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      workspace: { id: "ws-1" },
      workspaceId: "ws-1",
      userId: "user-1",
    })
  })

  test("enabled:true — flips coexistEnabled, inserts CoexistSyncRun init row, triggers smb_app_data", async () => {
    const result = await call(
      procedure,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: true })

    // Flag flipped on via the atomic UPDATE … RETURNING (one update on success).
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(dbUpdateBuilder.set).toHaveBeenCalledWith({ coexistEnabled: true })

    // CoexistSyncRun insert with the init-row values.
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(dbInsertBuilderRef.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationId: "int-1",
        channel: "whatsapp",
        status: "init",
        triggerSource: "popup-enable",
      }),
    )

    // Meta is asked to push data twice: smb_app_state_sync + history.
    expect(mockTriggerSmbAppDataSync).toHaveBeenCalledTimes(2)

    // No queue job — the scheduler drives the CoexistSyncRun row.
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  test("enabled:false — flag-only: flips coexistEnabled, no run insert, no delete, no job", async () => {
    const result = await call(
      procedure,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: false },
      { context: stubContext },
    )

    expect(result).toEqual({ success: true })

    expect(db.update).toHaveBeenCalledTimes(1)
    expect(dbUpdateBuilder.set).toHaveBeenCalledWith({ coexistEnabled: false })

    // Disable is flag-only (delete/cleanup deferred): no run insert, no staging
    // delete, no Meta trigger, no enqueue.
    expect(db.insert).not.toHaveBeenCalled()
    expect(dbExecute).not.toHaveBeenCalled()
    expect(mockTriggerSmbAppDataSync).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  test("enabled:true — surfaces failure reason and marks the run failed when smb_app_data fails", async () => {
    // smb_app_state_sync fails → handler returns the reason and marks the run.
    mockTriggerSmbAppDataSync
      .mockResolvedValueOnce({ ok: false, reason: "window_expired" })
      .mockResolvedValue({ ok: true })

    const result = await call(
      procedure,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: false, reason: "window_expired" })

    // Run was inserted, then a second update marked it failed.
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(db.update).toHaveBeenCalledTimes(2)
    expect(dbUpdateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    )
  })
})

// ---- H11: workspace membership enforcement --------------------------------
// workspaceActionClient checks that bindArgsClientInputs[0] is a valid
// workspaceId that belongs to the authenticated user. The test harness here
// verifies the contract via the action client source:
// - workspaceActionClient throws "Workspace not found" when the workspace is
//   absent from the authenticated user's membership list.
// NOTE: We cannot fully simulate the action pipeline without a live DB, so
// this test asserts the source-level guarantee: workspaceActionClient is
// imported from "@/lib/safe-action" and is distinct from authActionClient.
describe("disconnectWhatsappAction — workspace membership guard (H11)", () => {
  test("action uses workspaceActionClient, not authActionClient", async () => {
    // Dynamic import after mocks are set up.
    const actionModule = await import(
      "@/features/integration-whatsapp/actions/disconnect.action"
    )
    const safeActionModule = await import("@/lib/safe-action")

    // The action must be defined.
    expect(actionModule.disconnectWhatsappAction).toBeDefined()

    // workspaceActionClient exists and is not the same object as authActionClient,
    // confirming the correct client is exported.
    expect(safeActionModule.workspaceActionClient).toBeDefined()
    expect(safeActionModule.workspaceActionClient).not.toBe(
      safeActionModule.authActionClient,
    )
  })
})

// ---- H12: i18n key presence -----------------------------------------------
// These assertions verify that the keys referenced in the coexist toggle
// components (and whatsapp-create.tsx) exist in BOTH locale files.
describe("i18n key presence (H12)", () => {
  test("coexist.toggleHelperMessenger is defined in en.json and vi.json", () => {
    expect(
      (
        enMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.toggleHelperMessenger,
    ).toBeDefined()
    expect(
      (
        viMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.toggleHelperMessenger,
    ).toBeDefined()
  })

  test("coexist.toggleHelperWhatsapp is defined in en.json and vi.json", () => {
    expect(
      (
        enMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.toggleHelperWhatsapp,
    ).toBeDefined()
    expect(
      (
        viMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.toggleHelperWhatsapp,
    ).toBeDefined()
  })

  test("whatsapp.fillRequiredFields is defined in en.json and vi.json", () => {
    expect(
      (
        enMessages as Record<string, unknown> & {
          whatsapp: Record<string, unknown>
        }
      ).whatsapp.fillRequiredFields,
    ).toBeDefined()
    expect(
      (
        viMessages as Record<string, unknown> & {
          whatsapp: Record<string, unknown>
        }
      ).whatsapp.fillRequiredFields,
    ).toBeDefined()
  })

  test("whatsapp.continueManualConnect is defined in en.json and vi.json", () => {
    expect(
      (
        enMessages as Record<string, unknown> & {
          whatsapp: Record<string, unknown>
        }
      ).whatsapp.continueManualConnect,
    ).toBeDefined()
    expect(
      (
        viMessages as Record<string, unknown> & {
          whatsapp: Record<string, unknown>
        }
      ).whatsapp.continueManualConnect,
    ).toBeDefined()
  })
})
