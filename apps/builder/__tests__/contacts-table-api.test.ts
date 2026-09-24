// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

vi.mock("@chatbotx.io/database/repositories", () => {
  const proxy = new Proxy(
    {},
    { get: (_target, property) => (property === "then" ? undefined : proxy) },
  )
  return proxy
})

const { listContacts, countContacts, requireScope, procedures } = vi.hoisted(
  () => ({
    listContacts: vi.fn(),
    countContacts: vi.fn(),
    requireScope: vi.fn(),
    procedures: [] as Array<{
      route: { method: string; path: string }
      handler?: (args: { input: unknown; context: unknown }) => Promise<unknown>
    }>,
  }),
)

vi.mock("@/features/workspaces/schema/resource", () => ({
  withWorkspaceIdSchema: {},
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@/features/contacts/permissions", () => ({
  buildContactPermissionScope: vi.fn(),
  requireContactPermissionScope: vi.fn(),
  requireContactPermissionScopeForMember: requireScope,
}))
vi.mock("@/features/contacts/queries/get-contact.query", () => ({
  getContact: vi.fn(),
}))
vi.mock("@/features/contacts/queries/get-export-file.query", () => ({
  getExportFile: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contact-inboxes.queries", () => ({
  countContactInboxes: vi.fn(),
  listAudienceInboxesPreview: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contacts.queries", () => ({
  countContacts,
  listContacts,
}))
vi.mock("@/features/contacts/schema/action", () => ({
  getExportFileRequest: {},
  getExportFileResponse: {},
}))
vi.mock("@/features/contacts/schema/query", () => ({
  getContactRequest: {},
  getContactResponse: {},
  listContactInboxesAudiencePreviewRequest: {},
  listContactInboxesAudiencePreviewResponse: {},
  listContactsRequest: { and: () => ({}) },
  listContactsTableResponse: {},
}))

vi.mock("@/orpc", () => ({
  authorizedAPI: {
    route: (route: { method: string; path: string }) => {
      const procedure: (typeof procedures)[number] = { route }
      procedures.push(procedure)
      const chain = {
        input: () => chain,
        output: () => chain,
        use: () => chain,
        handler: (handler: NonNullable<typeof procedure.handler>) => {
          procedure.handler = handler
          return chain
        },
      }
      return chain
    },
  },
}))

await import("@/features/contacts/api/private")

const listProcedure = procedures.find(
  (procedure) =>
    procedure.route.path === "/workspaces/{workspaceId}/contacts/list",
)

if (!listProcedure?.handler) {
  throw new Error("Contacts list procedure was not registered")
}

const listHandler = listProcedure.handler

const countProcedure = procedures.find(
  (procedure) =>
    procedure.route.path === "/workspaces/{workspaceId}/contacts/count",
)

if (!countProcedure?.handler) {
  throw new Error("Contacts count procedure was not registered")
}

const countHandler = countProcedure.handler

describe("contacts table private API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("derives member scope server-side and returns valid empty table results", async () => {
    const scope = {
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-1",
    }
    requireScope.mockReturnValue(scope)
    listContacts.mockResolvedValue({
      data: [],
      pageCount: 0,
      totalCount: 0,
      totalCountCapped: false,
    })

    await expect(
      listHandler({
        input: { workspaceId: "workspace-1", page: 1, perPage: 50 },
        context: {
          user: { id: "user-1" },
          workspaceMember: { permissions: { onlyAssignedContacts: true } },
        },
      }),
    ).resolves.toEqual({
      data: [],
      pageCount: 0,
      totalCount: 0,
      totalCountCapped: false,
    })

    expect(requireScope).toHaveBeenCalledWith({
      permissions: { onlyAssignedContacts: true },
      userId: "user-1",
    })
    expect(listContacts).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", page: 1, perPage: 50 },
      scope,
    )
  })

  test("count handler derives member scope from context and passes it to countContacts", async () => {
    const scope = {
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-1",
    }
    requireScope.mockReturnValue(scope)
    countContacts.mockResolvedValue({ total: 0 })

    await expect(
      countHandler({
        input: { workspaceId: "workspace-1" },
        context: {
          user: { id: "user-1" },
          workspaceMember: { permissions: { onlyAssignedContacts: true } },
        },
      }),
    ).resolves.toEqual({ total: 0 })

    expect(requireScope).toHaveBeenCalledWith({
      permissions: { onlyAssignedContacts: true },
      userId: "user-1",
    })
    expect(countContacts).toHaveBeenCalledWith(
      { workspaceId: "workspace-1" },
      scope,
    )
  })
})
