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
type HandlerContext = {
  workspaceMember: { permissions: Record<string, unknown> }
  user: { id: string }
}
type ProcedureHandler = (args: {
  input: ListContactAppointmentsInput
  context: HandlerContext
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
        findByIdOrFail: vi.fn(),
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

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/business/contact-utils", () => ({
  maskContactEmailAndPhone: vi.fn((contact: unknown) => contact),
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    listContactAppointments: mocks.listContactAppointments,
  },
  contactService: {
    findByIdOrFail: mocks.findByIdOrFail,
  },
}))

const { appointmentsAuthenticatedAPI } = await import(
  "@/features/appointments/api/private"
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
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: "contact-1" })
    mocks.listContactAppointments.mockResolvedValueOnce([
      { id: "appointment-1", calendarName: "Discovery" },
    ])

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "workspace-1", contactId: "contact-1" },
        context: {
          workspaceMember: { permissions: { contacts: true } },
          user: { id: "user-1" },
        },
      }),
    ).resolves.toEqual([{ id: "appointment-1", calendarName: "Discovery" }])

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      accessScope: { restrictToAssignedUserId: undefined },
    })
    expect(mocks.listContactAppointments).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })

  test("rejects a caller without contacts-section access", async () => {
    mocks.findByIdOrFail.mockReset()
    mocks.listContactAppointments.mockReset()

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "workspace-1", contactId: "contact-1" },
        context: {
          workspaceMember: { permissions: {} },
          user: { id: "user-1" },
        },
      }),
    ).rejects.toThrow()

    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
    expect(mocks.listContactAppointments).not.toHaveBeenCalled()
  })
})
