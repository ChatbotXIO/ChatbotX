import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ListInput = { workspaceId: string; contactId: string }
type HandlerContext = {
  input: ListInput
  context: {
    user: { id: string }
    workspace: { ownerId: string }
    workspaceMember: { permissions: unknown }
  }
}
type ProcedureHandler = (args: HandlerContext) => Promise<unknown>

/**
 * Mirrors the fake procedure builder used in
 * `conversations-authenticated-api-block-gate.test.ts` — records the
 * handler under its route path so the test can invoke it directly with a
 * hand-built `context`, bypassing the real oRPC/middleware chain.
 */
const { authorizedAPI, handlersByPath } = vi.hoisted(() => {
  const handlersByPath: Record<string, ProcedureHandler> = {}

  function makeProcedure(): {
    route: (config: RouteConfig) => unknown
    input: (schema: unknown) => unknown
    use: (middleware: unknown, mapper?: unknown) => unknown
    output: (schema: unknown) => unknown
    handler: (handler: ProcedureHandler) => unknown
  } {
    let currentPath: string | undefined
    const procedure = {
      route: (config: RouteConfig) => {
        currentPath = config.path
        return procedure
      },
      input: (_schema: unknown) => procedure,
      use: (_middleware: unknown, _mapper?: unknown) => procedure,
      output: (_schema: unknown) => procedure,
      handler: (handler: ProcedureHandler) => {
        if (currentPath) {
          handlersByPath[currentPath] = handler
        }
        return { handler }
      },
    }
    return procedure
  }

  return {
    authorizedAPI: {
      route: (config: RouteConfig) => makeProcedure().route(config),
    },
    handlersByPath,
  }
})

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))

const { listByContactId } = vi.hoisted(() => ({
  listByContactId: vi.fn(),
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: { listByContactId },
}))
vi.mock("@chatbotx.io/business/contact-utils", () => ({
  maskContactEmailAndPhone: vi.fn((contact: unknown) => contact),
}))

// `@/features/contacts/permissions` re-exports from `@/lib/auth/utils`,
// which pulls in the real `better-auth` server config and opens a DB
// connection at import time. Mock only that leaf so the real, pure
// `getAssignedContactsUserId` the handler depends on still runs — see
// `contacts-permissions.test.ts` for the same pattern.
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

await import("@/features/contact-sequences/api/private")

const LIST_PATH = "/workspaces/{workspaceId}/contacts/{contactId}/sequences"

beforeEach(() => {
  vi.clearAllMocks()
  listByContactId.mockResolvedValue([])
})

describe("contactSequencesAuthenticatedAPI — access scoping", () => {
  test("passes no restriction for a member without onlyAssignedContacts", async () => {
    const handler = handlersByPath[LIST_PATH]
    await handler?.({
      input: { workspaceId: "workspace-1", contactId: "contact-1" },
      context: {
        user: { id: "user-1" },
        workspace: { ownerId: "owner-1" },
        workspaceMember: { permissions: { contacts: true } },
      },
    })

    expect(listByContactId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      accessScope: { restrictToAssignedUserId: undefined },
    })
  })

  test("restricts to the caller when the member only has onlyAssignedContacts", async () => {
    const handler = handlersByPath[LIST_PATH]
    await handler?.({
      input: { workspaceId: "workspace-1", contactId: "contact-1" },
      context: {
        user: { id: "user-1" },
        workspace: { ownerId: "owner-1" },
        workspaceMember: { permissions: { onlyAssignedContacts: true } },
      },
    })

    expect(listByContactId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      accessScope: { restrictToAssignedUserId: "user-1" },
    })
  })

  test("rejects a member without contacts access", async () => {
    const handler = handlersByPath[LIST_PATH]

    await expect(
      handler?.({
        input: { workspaceId: "workspace-1", contactId: "contact-1" },
        context: {
          user: { id: "user-1" },
          workspace: { ownerId: "owner-1" },
          workspaceMember: { permissions: {} },
        },
      }),
    ).rejects.toThrow("User is not authorized to access contacts")

    expect(listByContactId).not.toHaveBeenCalled()
  })
})
