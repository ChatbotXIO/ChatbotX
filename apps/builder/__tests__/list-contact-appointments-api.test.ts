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
        requireContactPermissionScopeForMember: vi.fn(),
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

vi.mock("@/features/contacts/permissions", () => ({
  requireContactPermissionScopeForMember:
    mocks.requireContactPermissionScopeForMember,
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    listContactAppointments: mocks.listContactAppointments,
  },
}))

// The handler loads after mocks because a static import resolves real server
// dependencies before Vitest can install the test substitutes.
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

  test("passes the member contact scope to appointmentService", async () => {
    mocks.requireContactPermissionScopeForMember.mockReturnValueOnce({
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: undefined,
    })
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

    expect(mocks.listContactAppointments).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      accessScope: { restrictToAssignedUserId: undefined },
    })
  })

  test("rejects a caller without contacts-section access", async () => {
    mocks.requireContactPermissionScopeForMember.mockImplementationOnce(() => {
      throw new Error("Contact not found")
    })
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

    expect(mocks.requireContactPermissionScopeForMember).toHaveBeenCalledWith({
      permissions: {},
      userId: "user-1",
    })
    expect(mocks.listContactAppointments).not.toHaveBeenCalled()
  })

  test("passes the assigned-contact restriction to appointmentService", async () => {
    mocks.requireContactPermissionScopeForMember.mockReturnValueOnce({
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-9",
    })
    mocks.listContactAppointments.mockResolvedValueOnce([])

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "workspace-1", contactId: "contact-1" },
        context: {
          workspaceMember: { permissions: { onlyAssignedContacts: true } },
          user: { id: "user-9" },
        },
      }),
    ).resolves.toEqual([])

    expect(mocks.listContactAppointments).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      accessScope: { restrictToAssignedUserId: "user-9" },
    })
  })
})
