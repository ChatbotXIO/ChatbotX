// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type HandlerContext = {
  isSupportSession?: boolean
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
        listContactCoupons: vi.fn(),
        listContactNotes: vi.fn(),
        listContactSequences: vi.fn(),
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
  contactNoteService: {
    listByContactId: mocks.listContactNotes,
  },
  contactService: {
    findByIdOrFail: mocks.findByIdOrFail,
  },
  couponService: {
    listIssuedCouponsForContact: mocks.listContactCoupons,
  },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    listByContactId: mocks.listContactSequences,
  },
}))

await import("@/features/contact-notes/api/private")
await import("@/features/contact-sequences/api/private")
await import("@/features/coupons/api/private")

const notesHandler = mocks.state.handlers.get(
  "/workspaces/{workspaceId}/contacts/{contactId}/notes",
)
const sequencesHandler = mocks.state.handlers.get(
  "/workspaces/{workspaceId}/contacts/{contactId}/sequences",
)
const couponsHandler = mocks.state.handlers.get(
  "/workspaces/{workspaceId}/contacts/{contactId}/coupons",
)

const baseInput: HandlerInput = {
  workspaceId: "workspace-1",
  contactId: "contact-1",
}

const contextFor = (
  permissions: Record<string, unknown>,
  userId = "user-1",
  isSupportSession = false,
): HandlerContext => ({
  isSupportSession,
  workspaceMember: { permissions },
  user: { id: userId },
})

describe.each([
  {
    name: "listContactNotesAuthenticatedAPI",
    handler: () => notesHandler,
    listServiceMock: () => mocks.listContactNotes,
  },
  {
    name: "listContactSequencesAuthenticatedAPI",
    handler: () => sequencesHandler,
    listServiceMock: () => mocks.listContactSequences,
  },
  {
    name: "listContactCouponsAPI",
    handler: () => couponsHandler,
    listServiceMock: () => mocks.listContactCoupons,
  },
])("$name", ({ handler, listServiceMock }) => {
  test("registers a handler", () => {
    expect(handler()).toBeDefined()
  })

  test("rejects a caller without contacts-section access and never reaches the list service", async () => {
    mocks.findByIdOrFail.mockReset()
    listServiceMock().mockReset()

    await expect(
      handler()?.({ input: baseInput, context: contextFor({}) }),
    ).rejects.toThrow()

    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
    expect(listServiceMock()).not.toHaveBeenCalled()
  })

  test("scopes the contact lookup to the caller's assigned contacts and rejects when out of scope", async () => {
    mocks.findByIdOrFail.mockReset()
    listServiceMock().mockReset()
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(
      handler()?.({
        input: baseInput,
        context: contextFor({ onlyAssignedContacts: true }, "user-9"),
      }),
    ).rejects.toThrow("Contact not found")

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      accessScope: { restrictToAssignedUserId: "user-9" },
    })
    expect(listServiceMock()).not.toHaveBeenCalled()
  })

  test("lets a synthetic support-session super-admin reach the list service without an assignment restriction", async () => {
    mocks.findByIdOrFail.mockReset()
    listServiceMock().mockReset()
    mocks.findByIdOrFail.mockResolvedValueOnce({ id: "contact-1" })
    listServiceMock().mockResolvedValueOnce([])

    await handler()?.({
      input: baseInput,
      context: contextFor({ superAdmin: true }, "user-1", true),
    })

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      accessScope: { restrictToAssignedUserId: undefined },
    })
    expect(listServiceMock()).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
})
