// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type HandlerContext = {
  workspaceMember: { permissions: Record<string, unknown> }
  user: { id: string }
}

type HandlerInput = { workspaceId: string; contactId: string }

type ProcedureHandler = (args: {
  input: HandlerInput
  context: HandlerContext
}) => Promise<unknown>

type WorkspaceMapper = (input: HandlerInput) => string

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handlers: Map<string, ProcedureHandler>
      routeConfigs: Map<string, RouteConfig>
      middleware?: unknown
      workspaceMapper?: WorkspaceMapper
    } = { handlers: new Map(), routeConfigs: new Map() }

    let currentPath: string | undefined

    const procedure = {
      route: vi.fn((config: RouteConfig) => {
        currentPath = config.path
        state.routeConfigs.set(config.path, config)
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
        if (currentPath) {
          state.handlers.set(currentPath, handler)
        }
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        listContactAppointments: vi.fn(),
        listContactCoupons: vi.fn(),
        listContactNotes: vi.fn(),
        listContactSequences: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))
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
  contactNoteService: { listByContactId: mocks.listContactNotes },
  couponService: { listIssuedCouponsForContact: mocks.listContactCoupons },
}))
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    listByContactId: mocks.listContactSequences,
  },
}))

// These handlers must load after their mocks; static imports resolve real
// server dependencies before the test modules can install their substitutes.
await import("@/features/appointments/api/private")
await import("@/features/contact-notes/api/private")
await import("@/features/contact-sequences/api/private")
await import("@/features/coupons/api/private")

const baseInput: HandlerInput = {
  workspaceId: "workspace-1",
  contactId: "contact-1",
}

const contextFor = (
  permissions: Record<string, unknown>,
  userId = "user-1",
): HandlerContext => ({
  workspaceMember: { permissions },
  user: { id: userId },
})

const handlers = [
  {
    handler: () =>
      mocks.state.handlers.get(
        "/workspaces/{workspaceId}/contacts/{contactId}/notes",
      ),
    listServiceMock: () => mocks.listContactNotes,
    name: "listContactNotesAuthenticatedAPI",
  },
  {
    handler: () =>
      mocks.state.handlers.get(
        "/workspaces/{workspaceId}/contacts/{contactId}/sequences",
      ),
    listServiceMock: () => mocks.listContactSequences,
    name: "listContactSequencesAuthenticatedAPI",
  },
  {
    handler: () =>
      mocks.state.handlers.get(
        "/workspaces/{workspaceId}/contacts/{contactId}/appointments",
      ),
    listServiceMock: () => mocks.listContactAppointments,
    name: "listContactAppointmentsAPI",
  },
  {
    handler: () =>
      mocks.state.handlers.get(
        "/workspaces/{workspaceId}/contacts/{contactId}/coupons",
      ),
    listServiceMock: () => mocks.listContactCoupons,
    name: "listContactCouponsAPI",
  },
]

describe.each(handlers)("$name", ({ handler, listServiceMock }) => {
  test("registers a handler", () => {
    expect(handler()).toBeDefined()
  })

  test("returns not-found without contacts-section access", async () => {
    listServiceMock().mockReset()

    await expect(
      handler()?.({ input: baseInput, context: contextFor({}) }),
    ).rejects.toThrow("Contact not found")

    expect(listServiceMock()).not.toHaveBeenCalled()
  })

  test("passes an assigned-contact scope to the list service", async () => {
    listServiceMock().mockReset()
    listServiceMock().mockResolvedValueOnce([])

    await handler()?.({
      input: baseInput,
      context: contextFor({ onlyAssignedContacts: true }, "user-9"),
    })

    expect(listServiceMock()).toHaveBeenCalledWith({
      ...baseInput,
      accessScope: { restrictToAssignedUserId: "user-9" },
    })
  })

  test("does not restrict super admins with assigned-contact permission", async () => {
    listServiceMock().mockReset()
    listServiceMock().mockResolvedValueOnce([])

    await handler()?.({
      input: baseInput,
      context: contextFor(
        { onlyAssignedContacts: true, superAdmin: true },
        "user-9",
      ),
    })

    expect(listServiceMock()).toHaveBeenCalledWith({
      ...baseInput,
      accessScope: { restrictToAssignedUserId: undefined },
    })
  })
})
