import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: {
  input: Record<string, unknown>
  context: unknown
}) => Promise<unknown>

const { authorizedAPI, workspaceTokenAuthAPIForScope, handlersByPath } =
  vi.hoisted(() => {
    const handlersByPath: Record<string, Handler> = {}
    const makeApi = () => ({
      route: (config: { path: string }) => {
        const procedure = {
          input: () => procedure,
          use: () => procedure,
          output: () => procedure,
          errors: () => procedure,
          handler: (handler: Handler) => {
            handlersByPath[config.path] = handler
            return { handler }
          },
        }
        return procedure
      },
    })
    return {
      authorizedAPI: makeApi(),
      workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => makeApi()),
      handlersByPath,
    }
  })

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  resolveIdByIdentifier: vi.fn(),
  requireScope: vi.fn(),
}))

vi.mock("@/orpc", () => ({ authorizedAPI, workspaceTokenAuthAPIForScope }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  contactExportService: {},
  contactService: { resolveIdByIdentifier: mocks.resolveIdByIdentifier },
  contactTouchpointService: { list: mocks.list },
}))
vi.mock("@/features/contacts/permissions", () => ({
  buildContactPermissionScope: vi.fn(),
  exportFileOwnerFilter: vi.fn(),
  requireContactPermissionScope: vi.fn(),
  requireContactPermissionScopeForMember: mocks.requireScope,
}))
vi.mock("@/features/contacts/lib/list-contact-ad-referrals", () => ({
  listContactAdReferrals: vi.fn(),
}))
vi.mock("@/features/contacts/lib/list-contact-broadcasts", () => ({
  listContactBroadcastsPage: vi.fn(),
}))
vi.mock("@/features/contacts/lib/list-contact-export-files", () => ({
  listContactExportFiles: vi.fn(),
}))
vi.mock("@/features/contacts/queries/get-contact.query", () => ({
  getContact: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contact-inboxes.queries", () => ({
  countContactInboxes: vi.fn(),
  listAudienceInboxesPreview: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contacts.queries", () => ({
  countContacts: vi.fn(),
  listContacts: vi.fn(),
}))

await import("@/features/contacts/api/private")
await import("@/features/contacts/api/public/touchpoints")
const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const { listContactTouchpointsRequest } = await import(
  "@/features/contacts/schema/touchpoint"
)
const { contactTouchpointKinds } = await import(
  "@chatbotx.io/database/partials"
)

const PRIVATE_PATH =
  "/workspaces/{workspaceId}/contacts/{contactId}/touchpoints"
const PUBLIC_PATH = "/v1/contacts/{identifier}/touchpoints"
const emptyPage = { data: [], nextCursor: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue(emptyPage)
  mocks.resolveIdByIdentifier.mockResolvedValue("contact-1")
})

describe("kinds request parameter", () => {
  const parse = (kinds: unknown) =>
    listContactTouchpointsRequest.safeParse({ kinds })

  test("accepts repeated parameters", () => {
    expect(parse(["poll", "minigame"])).toMatchObject({
      success: true,
      data: { kinds: ["poll", "minigame"] },
    })
  })

  test("accepts a single value and comma-separated values, mixed and de-duplicated", () => {
    expect(parse("poll")).toMatchObject({ data: { kinds: ["poll"] } })
    expect(parse("poll, minigame")).toMatchObject({
      data: { kinds: ["poll", "minigame"] },
    })
    expect(parse(["poll,minigame", "poll", ""])).toMatchObject({
      data: { kinds: ["poll", "minigame"] },
    })
  })

  test("means every kind when omitted or blank", () => {
    expect(parse(undefined)).toMatchObject({
      success: true,
      data: { kinds: undefined },
    })
    expect(parse(" , ")).toMatchObject({ data: { kinds: undefined } })
  })

  test("rejects a kind that does not exist", () => {
    expect(parse("poll,nope").success).toBe(false)
  })

  test("every kind name is accepted", () => {
    for (const kind of contactTouchpointKinds.options) {
      expect(parse(kind).success).toBe(true)
    }
  })

  test("clamps nothing silently: perPage above 100 is rejected", () => {
    expect(
      listContactTouchpointsRequest.safeParse({ perPage: 101 }).success,
    ).toBe(false)
  })
})

describe("private procedure", () => {
  const call = (
    input: Record<string, unknown> = {},
    permissions: unknown = {},
  ) =>
    handlersByPath[PRIVATE_PATH]?.({
      input: {
        workspaceId: "w-1",
        contactId: "c-1",
        perPage: 20,
        ...input,
      },
      context: { workspaceMember: { permissions }, user: { id: "u-1" } },
    })

  test("limits a restricted member to their assigned contacts", async () => {
    mocks.requireScope.mockReturnValue({ restrictToAssignedUserId: "u-1" })

    await call({ kinds: ["poll"] })

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "w-1",
      contactId: "c-1",
      kinds: ["poll"],
      perPage: 20,
      cursor: undefined,
      accessScope: { restrictToAssignedUserId: "u-1" },
    })
  })

  test("lets an unrestricted member read every contact", async () => {
    mocks.requireScope.mockReturnValue({ restrictToAssignedUserId: undefined })

    await call()

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        accessScope: { restrictToAssignedUserId: undefined },
      }),
    )
  })

  test("a member with no contact access gets not found and nothing is read", async () => {
    mocks.requireScope.mockImplementation(() => {
      throw new Error("Contact not found")
    })

    await expect(call()).rejects.toThrow("Contact not found")
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test("propagates the service's 404 for a contact of another workspace", async () => {
    mocks.requireScope.mockReturnValue({ restrictToAssignedUserId: undefined })
    mocks.list.mockRejectedValueOnce(
      Object.assign(new Error("Contact not found"), { httpStatusCode: 404 }),
    )

    await expect(call()).rejects.toMatchObject({ httpStatusCode: 404 })
  })

  test("propagates the service's invalidCursor 400", async () => {
    mocks.requireScope.mockReturnValue({ restrictToAssignedUserId: undefined })
    mocks.list.mockRejectedValueOnce(
      Object.assign(new Error("The cursor is invalid."), {
        code: "invalidCursor",
        httpStatusCode: 400,
      }),
    )

    await expect(call({ cursor: "garbage" })).rejects.toMatchObject({
      code: "invalidCursor",
      httpStatusCode: 400,
    })
  })
})

describe("public procedure", () => {
  test("is registered under the contacts scope", () => {
    expect(scopeArgAtImport).toBe("contacts")
    expect(handlersByPath[PUBLIC_PATH]).toBeDefined()
  })

  test("resolves the identifier in the token's workspace and calls the same service", async () => {
    await handlersByPath[PUBLIC_PATH]?.({
      context: { workspace: { id: "w-1" } },
      input: {
        identifier: "phone:+841234567890",
        perPage: 5,
        kinds: ["minigame"],
        cursor: "abc",
      },
    })

    expect(mocks.resolveIdByIdentifier).toHaveBeenCalledWith({
      identifier: "phone:+841234567890",
      workspaceId: "w-1",
    })
    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "w-1",
      contactId: "contact-1",
      kinds: ["minigame"],
      perPage: 5,
      cursor: "abc",
    })
  })
})
