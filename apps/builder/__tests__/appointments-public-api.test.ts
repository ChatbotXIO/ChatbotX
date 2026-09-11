import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  errors?: Record<string, unknown>
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn((errorMap: Record<string, unknown>) => {
        record.errors = errorMap
        return chain
      }),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const appointmentService = {
  list: vi.fn(),
  findByOrFail: vi.fn(),
  bookAppointment: vi.fn(),
  cancelAppointmentById: vi.fn(),
  deleteAppointmentById: vi.fn(),
}
const resolveTenantSettings = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  appointmentService,
  resolveTenantSettings,
}))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
    optional: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    appointmentModel: {},
  }
})

await import("@/features/appointments/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the appointments public router under the appointments scope", () => {
  expect(scopeArgAtImport).toBe("appointments")
})

describe("GET /v1/appointments", () => {
  const procedure = findProcedure("GET", "/v1/appointments")

  test("resolves appUrl itself and delegates to appointmentService.list without a session", async () => {
    resolveTenantSettings.mockResolvedValueOnce({ appUrl: "https://app.test" })
    appointmentService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, calendarId: "cal-1", tab: "next" },
    })

    expect(resolveTenantSettings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(appointmentService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "cal-1",
      tab: "next",
      search: undefined,
      page: 1,
      perPage: 50,
      appUrl: "https://app.test",
    })
  })
})

describe("GET /v1/appointments/{id}", () => {
  const procedure = findProcedure("GET", "/v1/appointments/{id}")

  test("delegates to appointmentService.findByOrFail", async () => {
    appointmentService.findByOrFail.mockResolvedValueOnce({ id: "appt-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "appt-1" },
    })

    expect(appointmentService.findByOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "appt-1",
    })
  })
})

describe("POST /v1/appointments", () => {
  const procedure = findProcedure("POST", "/v1/appointments")

  test("delegates to appointmentService.bookAppointment", async () => {
    const startAt = new Date("2026-01-01T10:00:00Z")
    appointmentService.bookAppointment.mockResolvedValueOnce({ id: "appt-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        calendarId: "cal-1",
        contactId: "contact-1",
        conversationId: "conv-1",
        startAt,
        inviteeTimezone: "UTC",
      },
    })

    expect(appointmentService.bookAppointment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "cal-1",
      contactId: "contact-1",
      conversationId: "conv-1",
      startAt,
      inviteeTimezone: "UTC",
    })
  })

  // The workspace-scoping check for contactId/conversationId lives in
  // appointmentService.bookAppointment itself, not this handler — see
  // packages/business/__tests__/appointment-service-webview.test.ts for the
  // cross-tenant regression coverage.

  test("declares the booking 409 error codes", () => {
    expect(procedure.errors).toMatchObject({
      notFound: { status: 404 },
      slotUnavailable: { status: 409 },
      appointmentAvailabilityChanged: { status: 409 },
      appointmentAlreadyScheduled: { status: 409 },
    })
  })
})

describe("POST /v1/appointments/{id}/cancel", () => {
  const procedure = findProcedure("POST", "/v1/appointments/{id}/cancel")

  test("delegates to appointmentService.cancelAppointmentById", async () => {
    appointmentService.cancelAppointmentById.mockResolvedValueOnce({
      id: "appt-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "appt-1" },
    })

    expect(appointmentService.cancelAppointmentById).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appt-1",
    })
  })
})

describe("DELETE /v1/appointments/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/appointments/{id}")

  test("delegates to appointmentService.deleteAppointmentById", async () => {
    appointmentService.deleteAppointmentById.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "appt-1" },
    })

    expect(appointmentService.deleteAppointmentById).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appt-1",
    })
  })
})
