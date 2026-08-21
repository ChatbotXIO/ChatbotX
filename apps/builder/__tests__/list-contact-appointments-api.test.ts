import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ListContactAppointmentsInput = {
  workspaceId: string
  contactId: string
}

type ListContactAppointmentsResult = {
  id: string
  calendarName: string
}[]

type WorkspaceMapper = (input: ListContactAppointmentsInput) => string
type ProcedureHandler = (args: {
  input: ListContactAppointmentsInput
}) => Promise<ListContactAppointmentsResult>

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handler?: ProcedureHandler
      middleware?: unknown
      routeConfig?: RouteConfig
      workspaceMapper?: WorkspaceMapper
    } = {}

    const procedure = {
      route: vi.fn((config: RouteConfig) => {
        state.routeConfig = config
        return procedure
      }),
      input: vi.fn((_schema: unknown) => procedure),
      use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
        state.middleware = middleware
        state.workspaceMapper = mapper
        return procedure
      }),
      output: vi.fn((_schema: unknown) => procedure),
      handler: vi.fn((handler: ProcedureHandler) => {
        state.handler = handler
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        listContactAppointments: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({
  authorizedAPI,
}))

vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware,
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    listContactAppointments: mocks.listContactAppointments,
  },
}))

const { appointmentsAuthenticatedAPI } = await import(
  "@/features/appointments/api/authenticated"
)

describe("listContactAppointmentsAPI", () => {
  test("registers an authenticated workspace-scoped GET endpoint", () => {
    expect(appointmentsAuthenticatedAPI).toHaveProperty(
      "listContactAppointmentsAPI",
    )
    expect(mocks.state.routeConfig).toEqual({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/appointments",
      summary: "List appointments for a contact",
      tags: ["Appointments"],
    })
    expect(mocks.state.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(
      mocks.state.workspaceMapper?.({
        workspaceId: "workspace-1",
        contactId: "contact-1",
      }),
    ).toBe("workspace-1")
    expect(mocks.state.handler).toBeDefined()
  })

  test("calls appointmentService.listContactAppointments with validated input", async () => {
    mocks.listContactAppointments.mockResolvedValueOnce([
      { id: "appointment-1", calendarName: "Discovery" },
    ])

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "workspace-1", contactId: "contact-1" },
      }),
    ).resolves.toEqual([{ id: "appointment-1", calendarName: "Discovery" }])

    expect(mocks.listContactAppointments).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
})
