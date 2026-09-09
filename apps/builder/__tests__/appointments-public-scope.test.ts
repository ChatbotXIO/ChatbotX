// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const appointmentCalendarService = { list: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  appointmentCalendarService,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { appointmentCalendarsPublicRouter } = await import(
  "../src/features/appointment-calendars/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invoke = (procedure: typeof appointmentCalendarsPublicRouter.list) =>
  call(
    procedure,
    { page: 1, perPage: 50 },
    {
      context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
    },
  )

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: appointment calendars public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/appointment-calendars route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(appointmentCalendarsPublicRouter.list),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'appointments' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/appointment-calendars route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    appointmentCalendarService.list.mockResolvedValue({
      data: [],
      pageCount: 1,
      total: 0,
    })

    await expect(
      invoke(appointmentCalendarsPublicRouter.list),
    ).resolves.toMatchObject({ data: [] })
  })

  test("an appointments-scoped token passes the real GET /v1/appointment-calendars route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["appointments"]))
    appointmentCalendarService.list.mockResolvedValue({
      data: [],
      pageCount: 1,
      total: 0,
    })

    await expect(
      invoke(appointmentCalendarsPublicRouter.list),
    ).resolves.toMatchObject({ data: [] })
  })
})
