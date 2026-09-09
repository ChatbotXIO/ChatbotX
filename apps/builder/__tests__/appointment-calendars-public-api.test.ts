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
      errors: vi.fn(() => chain),
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

const appointmentCalendarService = {
  list: vi.fn(),
  getForEdit: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  duplicate: vi.fn(),
  deleteMany: vi.fn(),
}
const appointmentService = {
  checkAvailability: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  appointmentCalendarService,
  appointmentService,
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
    appointmentCalendarModel: {},
    appointmentCalendarAvailabilityModel: {},
    appointmentCalendarReminderModel: {},
  }
})

await import("@/features/appointment-calendars/api/public")

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

test("registers the appointment calendars public router under the appointments scope", () => {
  expect(scopeArgAtImport).toBe("appointments")
})

describe("GET /v1/appointment-calendars", () => {
  const procedure = findProcedure("GET", "/v1/appointment-calendars")

  test("delegates to appointmentCalendarService.list", async () => {
    appointmentCalendarService.list.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, search: "sales" },
    })

    expect(appointmentCalendarService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      search: "sales",
      workspaceId: "workspace-1",
    })
  })
})

describe("GET /v1/appointment-calendars/{id}", () => {
  const procedure = findProcedure("GET", "/v1/appointment-calendars/{id}")

  test("delegates to appointmentCalendarService.getForEdit", async () => {
    appointmentCalendarService.getForEdit.mockResolvedValueOnce({
      id: "cal-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "cal-1" },
    })

    expect(appointmentCalendarService.getForEdit).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "cal-1",
    })
  })
})

describe("POST /v1/appointment-calendars", () => {
  const procedure = findProcedure("POST", "/v1/appointment-calendars")

  test("delegates to appointmentCalendarService.create", async () => {
    appointmentCalendarService.create.mockResolvedValueOnce("cal-1")

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Sales calls" },
    })

    expect(appointmentCalendarService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Sales calls",
    })
    expect(result).toEqual({ id: "cal-1" })
  })
})

describe("PUT /v1/appointment-calendars/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/appointment-calendars/{id}")

  test("derives scheduleWindowType from scheduleWindowConfig", async () => {
    appointmentCalendarService.update.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        id: "cal-1",
        name: "Sales calls",
        active: true,
        timezone: "UTC",
        durationMinutes: 30,
        scheduleWindowConfig: {
          scheduleWindowType: "rollingDays",
          rollingDays: 14,
        },
        availability: [],
        reminders: [],
      },
    })

    expect(appointmentCalendarService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        id: "cal-1",
        scheduleWindowType: "rollingDays",
      }),
    )
  })
})

describe("PATCH /v1/appointment-calendars/{id}/active", () => {
  const procedure = findProcedure(
    "PATCH",
    "/v1/appointment-calendars/{id}/active",
  )

  test("delegates to appointmentCalendarService.setActive", async () => {
    appointmentCalendarService.setActive.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "cal-1", active: false },
    })

    expect(appointmentCalendarService.setActive).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "cal-1",
      active: false,
    })
  })
})

describe("POST /v1/appointment-calendars/{id}/duplicate", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/appointment-calendars/{id}/duplicate",
  )

  test("delegates to appointmentCalendarService.duplicate", async () => {
    appointmentCalendarService.duplicate.mockResolvedValueOnce("cal-2")

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "cal-1" },
    })

    expect(appointmentCalendarService.duplicate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "cal-1",
    })
    expect(result).toEqual({ id: "cal-2" })
  })
})

describe("DELETE /v1/appointment-calendars/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/appointment-calendars/{id}")

  test("delegates to appointmentCalendarService.deleteMany", async () => {
    appointmentCalendarService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "cal-1" },
    })

    expect(appointmentCalendarService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["cal-1"],
    })
  })
})

describe("GET /v1/appointment-calendars/{id}/availability", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/appointment-calendars/{id}/availability",
  )

  test("delegates to appointmentService.checkAvailability", async () => {
    const startDate = new Date("2026-01-01T00:00:00Z")
    const endDate = new Date("2026-01-07T00:00:00Z")
    appointmentService.checkAvailability.mockResolvedValueOnce({
      text: "",
      slots: [],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "cal-1", startDate, endDate, contactId: "contact-1" },
    })

    expect(appointmentService.checkAvailability).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      calendarId: "cal-1",
      contactId: "contact-1",
      startDate,
      endDate,
    })
  })
})
