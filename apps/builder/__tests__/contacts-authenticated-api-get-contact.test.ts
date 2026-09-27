// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type GetContactInput = { workspaceId: string; contactId: string }
type HandlerContext = {
  input: GetContactInput
  context: {
    user: { id: string }
    workspaceMember: { permissions: unknown }
  }
}
type ProcedureHandler = (args: HandlerContext) => Promise<unknown>

/**
 * Same fake procedure builder as `contact-notes-authenticated-api.test.ts`:
 * records each handler under its route path so the test can call it with a
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

const { getContactMock } = vi.hoisted(() => ({
  getContactMock: vi.fn(),
}))

vi.mock("@/features/contacts/queries/get-contact.query", () => ({
  getContact: getContactMock,
}))
vi.mock("@/features/contacts/queries/get-export-file.query", () => ({
  getExportFile: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contact-inboxes.queries", () => ({
  countContactInboxes: vi.fn(),
  listAudienceInboxesPreview: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contacts.queries", () => ({
  countContacts: vi.fn(),
  listContacts: vi.fn(),
}))

// `@/features/contacts/permissions` re-exports from `@/lib/auth/utils`,
// which opens a DB connection at import time. Mock only that leaf so the
// real `buildContactPermissionScope` the handler depends on still runs.
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

await import("@/features/contacts/api/private")

const GET_PATH = "/workspaces/{workspaceId}/contacts/{contactId}"
const input = { workspaceId: "workspace-1", contactId: "contact-1" }

beforeEach(() => {
  vi.clearAllMocks()
  getContactMock.mockResolvedValue({ id: "contact-1" })
})

describe("getContactAuthenticatedAPI — access scoping", () => {
  test("passes an unrestricted scope for a member with full contacts access", async () => {
    const handler = handlersByPath[GET_PATH]
    await handler?.({
      input,
      context: {
        user: { id: "user-1" },
        workspaceMember: {
          permissions: { contacts: true, emailAndPhone: true },
        },
      },
    })

    expect(getContactMock).toHaveBeenCalledWith(input, {
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
  })

  test("restricts to the caller and masks PII for an assigned-only member", async () => {
    const handler = handlersByPath[GET_PATH]
    await handler?.({
      input,
      context: {
        user: { id: "user-1" },
        workspaceMember: { permissions: { onlyAssignedContacts: true } },
      },
    })

    expect(getContactMock).toHaveBeenCalledWith(input, {
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-1",
    })
  })

  test("returns not found for a member without contacts access", async () => {
    const handler = handlersByPath[GET_PATH]

    await expect(
      handler?.({
        input,
        context: {
          user: { id: "user-1" },
          workspaceMember: { permissions: {} },
        },
      }),
    ).rejects.toThrow("Contact not found")

    expect(getContactMock).not.toHaveBeenCalled()
  })
})
