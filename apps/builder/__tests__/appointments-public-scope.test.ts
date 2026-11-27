// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  resolveTenantSettings,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  resolveTenantSettings: vi.fn(),
}))

const appointmentCalendarService = { list: vi.fn() }
const conversationService = {
  findByOrFail: vi.fn(),
  resolveContactInboxForConversation: vi.fn(),
}
const createInboxBookingLink = vi.fn()
const sendInboxBookingLink = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  appointmentCalendarService,
  appointmentService: {},
  conversationService,
  conversationMemberScope: { allows: () => true, resolve: vi.fn() },
  contactService: {},
  flowService: {},
  buildContactPermissionScope: vi.fn(),
  UNSCOPED: Symbol("unscoped"),
  createInboxBookingLink,
  sendInboxBookingLink,
  resolveTenantSettings,
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
const { appointmentsPublicRouter } = await import(
  "../src/features/appointments/api/public"
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
  resolveTenantSettings.mockResolvedValue({ appUrl: "https://tenant.example/" })
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

describe("real router: appointments.createBookingLink scope wiring", () => {
  const link = {
    url: "https://tenant.example/booking/picker?token=abc",
    expiresAt: new Date("2026-11-15T00:00:00Z"),
    calendar: { id: "11", name: "Consultation" },
    messageText: "Choose an appointment time",
  }
  const invokeLink = (send: boolean) =>
    call(
      appointmentsPublicRouter.createBookingLink,
      { conversationId: "21", calendarId: "11", send },
      {
        context: {
          headers: new Headers({ Authorization: `Bearer ${TOKEN}` }),
        },
      },
    )

  beforeEach(() => {
    conversationService.findByOrFail.mockResolvedValue({
      id: "21",
      contactId: "31",
      workspaceId: "ws-1",
    })
    conversationService.resolveContactInboxForConversation.mockResolvedValue({
      id: "41",
      inboxId: "51",
    })
    createInboxBookingLink.mockResolvedValue(link)
    sendInboxBookingLink.mockResolvedValue({
      ...link,
      message: { id: "61" },
    })
  })

  test("an appointments-only token creates a link without sending", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["appointments"]))

    await expect(invokeLink(false)).resolves.toMatchObject({
      url: link.url,
      messageId: null,
    })
  })

  test("an appointments-only token cannot send the link", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["appointments"]))

    await expect(invokeLink(true)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
    expect(conversationService.findByOrFail).not.toHaveBeenCalled()
    expect(sendInboxBookingLink).not.toHaveBeenCalled()
  })

  test("an inbox-only token is denied the appointments route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))

    await expect(invokeLink(false)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'appointments' scope",
    })
  })

  test("an all-scopes token sends the link", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))

    await expect(invokeLink(true)).resolves.toMatchObject({ messageId: "61" })
    expect(sendInboxBookingLink).toHaveBeenCalled()
  })
})
