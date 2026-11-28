import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: { input: unknown; context: unknown }) => Promise<unknown>

const { authorizedAPI, handlersByPath } = vi.hoisted(() => {
  const handlersByPath: Record<string, Handler> = {}
  const makeProcedure = () => {
    let currentPath: string | undefined
    const procedure = {
      route: (config: { path: string }) => {
        currentPath = config.path
        return procedure
      },
      input: () => procedure,
      use: () => procedure,
      output: () => procedure,
      handler: (handler: Handler) => {
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
      route: (config: { path: string }) => makeProcedure().route(config),
    },
    handlersByPath,
  }
})

const mocks = vi.hoisted(() => ({
  listForContact: vi.fn(),
  requireContactAccessForMember: vi.fn(),
}))

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  tagService: { listForContact: mocks.listForContact },
  contactExportService: {},
  contactTouchpointService: {},
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: vi.fn(),
}))
vi.mock("@/features/contacts/permissions", () => ({
  requireContactAccessForMember: mocks.requireContactAccessForMember,
  buildContactPermissionScope: vi.fn(),
  exportFileOwnerFilter: vi.fn(),
  requireContactPermissionScope: vi.fn(),
  requireContactPermissionScopeForMember: vi.fn(),
}))
vi.mock("@/features/contacts/lib/list-contact-ad-referrals", () => ({}))
vi.mock("@/features/contacts/lib/list-contact-broadcasts", () => ({}))
vi.mock("@/features/contacts/lib/list-contact-export-files", () => ({}))
vi.mock("@/features/contacts/queries/get-contact.query", () => ({}))
vi.mock("@/features/contacts/queries/list-contact-inboxes.queries", () => ({}))
vi.mock("@/features/contacts/queries/list-contacts.queries", () => ({}))

await import("@/features/contacts/api/private")

const PATH = "/workspaces/{workspaceId}/contacts/{contactId}/tags"
const context = {
  user: { id: "u1" },
  workspaceMember: { permissions: { contacts: "assigned" } },
}
const input = { workspaceId: "1", contactId: "9" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listContactTagsAuthenticatedAPI", () => {
  test("checks the member can reach the contact, then lists its tags", async () => {
    mocks.requireContactAccessForMember.mockResolvedValue(undefined)
    mocks.listForContact.mockResolvedValue([{ id: "t1", name: "a" }])

    expect(await handlersByPath[PATH]?.({ input, context })).toEqual({
      data: [{ id: "t1", name: "a" }],
    })
    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions: context.workspaceMember.permissions,
      userId: "u1",
      workspaceId: "1",
      contactId: "9",
    })
    expect(mocks.listForContact).toHaveBeenCalledWith(input)
  })

  test("a contact outside the member's scope is rejected and nothing is read", async () => {
    mocks.requireContactAccessForMember.mockRejectedValue(
      new Error("Contact not found"),
    )

    await expect(handlersByPath[PATH]?.({ input, context })).rejects.toThrow(
      "Contact not found",
    )
    expect(mocks.listForContact).not.toHaveBeenCalled()
  })
})
