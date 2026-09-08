// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, test, vi } from "vitest"
import enMessages from "../messages/en.json"
import viMessages from "../messages/vi.json"

// ---- mock: business service (the route now delegates entirely) -----------
const mockSetCoexist = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: { setCoexist: mockSetCoexist },
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  workspaceMemberService: {
    findMembership: vi.fn(async () => ({
      workspace: { id: "ws-1" },
      workspaceId: "ws-1",
      userId: "user-1",
    })),
  },
  resolveWorkspaceAccess: vi.fn(({ realMember }) => {
    if (!realMember) {
      return
    }
    return {
      workspace: realMember.workspace,
      member: realMember,
      isSupportSession: false,
    }
  }),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
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
}))

// ---- mock: smb_app_data trigger (Meta API) --------------------------------
const mockTriggerSmbAppDataSync = vi.fn()
vi.mock("@chatbotx.io/integration-whatsapp/api/coexists", () => ({
  triggerSmbAppDataSync: mockTriggerSmbAppDataSync,
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

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

// ---- dynamic imports AFTER mocks -----------------------------------------
const { call } = await import("@orpc/server")
const { integrationWhatsappCoexistAPIs } = await import(
  "@/features/integration-whatsapp/api/coexist"
)

const procedure = integrationWhatsappCoexistAPIs.setCoexistWhatsappAPI

// Stub initial context — authMiddleware reads headers for session.
// workspaceAuthorizedMidddleware reads db.query.workspaceMemberModel.findFirst
// which is already mocked above to return a valid member.
const stubContext = {
  headers: new Headers({ authorization: "Bearer test-token" }),
}

// ---- tests: pure delegation (the five behavioural cases moved to the -----
// business-layer test for `setCoexist`, packages/business/src/integration-
// whatsapp/__tests__/coexist.test.ts) --------------------------------------
describe("setCoexistWhatsappAPI — delegates to the service with the injected trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetCoexist.mockResolvedValue({ success: true })
  })

  test("calls integrationWhatsappService.setCoexist with the request fields and a triggerSync function, and returns its result unchanged", async () => {
    const result = await call(
      procedure,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: true })
    expect(mockSetCoexist).toHaveBeenCalledTimes(1)
    expect(mockSetCoexist).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      enabled: true,
      aiReadsSyncedHistory: false,
      triggerSync: expect.any(Function),
    })
  })

  test("aiReadsSyncedHistory:true is passed through", async () => {
    await call(
      procedure,
      {
        workspaceId: "ws-1",
        integrationId: "int-1",
        enabled: true,
        aiReadsSyncedHistory: true,
      },
      { context: stubContext },
    )

    expect(mockSetCoexist).toHaveBeenCalledWith(
      expect.objectContaining({ aiReadsSyncedHistory: true }),
    )
  })

  // The service can also return `cause` (e.g. "triggerRejected") — the
  // route's `.output(setCoexistResponseSchema)` strict-key failure variant
  // has no `cause` field, so zod strips it. Returning it from the mock and
  // keeping the exact-shape `toEqual` (not `objectContaining`) pins that
  // strip instead of merely asserting the fields that happen to survive.
  test("returns the service's failure result, stripped to the response schema's fields", async () => {
    mockSetCoexist.mockResolvedValueOnce({
      success: false,
      reason: "window_expired",
      cause: "triggerRejected",
    })

    const result = await call(
      procedure,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: false, reason: "window_expired" })
  })

  test("the injected triggerSync builds a minimal WhatsappAuthValue-shaped object and calls triggerSmbAppDataSync", async () => {
    mockTriggerSmbAppDataSync.mockResolvedValue({ ok: true })

    await call(
      procedure,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: true },
      { context: stubContext },
    )

    const { triggerSync } = mockSetCoexist.mock.calls[0][0]
    await triggerSync({
      accessToken: "token-abc",
      version: "v21.0",
      phoneNumberId: "pn-1",
      syncType: "history",
    })

    expect(mockTriggerSmbAppDataSync).toHaveBeenCalledWith({
      auth: { tokens: { accessToken: "token-abc" }, version: "v21.0" },
      phoneNumberId: "pn-1",
      syncType: "history",
    })
  })
})

// ---- H11: workspace membership enforcement --------------------------------
// workspaceActionClientAllowExpired still validates workspace membership, but
// keeps disconnect available for expired workspaces. This guard is source-level
// on purpose: importing the server action pulls in integration side effects that
// are unrelated to the coexist API assertions above.
describe("disconnectWhatsappAction — workspace membership guard (H11)", () => {
  test("action uses workspaceActionClientAllowExpired, not authActionClient", () => {
    const actionSource = readFileSync(
      resolve(
        import.meta.dirname,
        "../src/features/integration-whatsapp/actions/disconnect.action.ts",
      ),
      "utf8",
    )

    expect(actionSource).toContain(
      'import { workspaceActionClientAllowExpired } from "@/lib/safe-action"',
    )
    expect(actionSource).toContain(
      "export const disconnectWhatsappAction = workspaceActionClientAllowExpired",
    )
    expect(actionSource).not.toContain("authActionClient")
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

  test("coexist.aiReadsSyncedHistoryLabel is defined in en.json and vi.json", () => {
    expect(
      (
        enMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.aiReadsSyncedHistoryLabel,
    ).toBeDefined()
    expect(
      (
        viMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.aiReadsSyncedHistoryLabel,
    ).toBeDefined()
  })

  test("coexist.aiReadsSyncedHistoryHelper is defined in en.json and vi.json", () => {
    expect(
      (
        enMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.aiReadsSyncedHistoryHelper,
    ).toBeDefined()
    expect(
      (
        viMessages as unknown as Record<string, unknown> & {
          coexist: Record<string, unknown>
        }
      ).coexist.aiReadsSyncedHistoryHelper,
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
