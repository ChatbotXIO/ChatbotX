// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// `crud.ts`'s schemas transitively import many real cross-feature resource
// schemas (`schema/query.ts` → `inboxResource`, `userResource`, ...) which
// are only reachable through the real `@chatbotx.io/business` barrel — so,
// unlike the other contacts-public-api test files, this one leaves
// `@chatbotx.io/business` un-mocked (mirrors public-spec-operations.test.ts)
// and only proxy-mocks `@chatbotx.io/database/client` to keep a real `pg.Pool`
// from being constructed at import time. `contactService.upsertByIdentifier`
// is stubbed via `vi.spyOn` after the real import instead.
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

// The real `@chatbotx.io/business` barrel (kept for `inboxResource`, see
// below) pulls in `contactRepository`, which transitively needs the real
// contact-filter query graph (`applyContactFilter` → `contactInboxExists` →
// real `contactInboxModel`). This test never exercises real repository
// behavior — `contactService` is fully stubbed below — so proxy-mock the
// repositories module the same way as `database/client` above.
vi.mock("@chatbotx.io/database/repositories", () => {
  const nestedProxy: unknown = new Proxy(
    {},
    { get: (_obj, prop) => (prop === "then" ? undefined : nestedProxy) },
  )
  return new Proxy(
    {},
    { get: (_obj, prop) => (prop === "then" ? undefined : nestedProxy) },
  ) as Record<string, unknown>
})

type RouteConfig = {
  method: string
  path: string
  summary: string
  description?: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const listContacts = vi.fn()
const countContacts = vi.fn()
const resolveContactId = vi.fn()
const findPublicContactOrFail = vi.fn()

const createContact = vi.fn()

const deleteContact = vi.fn()

const updateContactFields = vi.fn()

const blockAndRecord = vi.fn()
const unblockAndRecord = vi.fn()
const upsertByIdentifier = vi.fn()
const findByIdOrFail = vi.fn()

const contactImportService = { startImport: vi.fn() }

const resolveAvatars = vi.hoisted(() =>
  vi.fn(async (contacts: { avatar: string | null }[]) =>
    contacts.map((contact) => ({
      ...contact,
      avatar: contact.avatar
        ? `https://app.test/media/${contact.avatar}`
        : null,
    })),
  ),
)
vi.mock("@/features/contacts/queries/resolve-contact-avatars", () => ({
  resolveContactAvatars: resolveAvatars,
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: () => ({ ipAddress: "203.0.113.9", userAgent: "curl/8" }),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    inboxResource: actual.inboxResource,
    UNSCOPED: actual.UNSCOPED,
    contactService: {
      list: listContacts,
      count: countContacts,
      resolveIdByIdentifier: resolveContactId,
      findPublicContactOrFail,
      createWithInbox: createContact,
      deleteAndRecord: deleteContact,
      updateFieldsAndCustomFields: updateContactFields,
      blockAndRecord,
      unblockAndRecord,
      upsertByIdentifier,
      findByIdOrFail,
    },
  }
})
// The member branch resolves scope through `@/features/contacts/permissions`,
// which also exports session-based helpers that pull in the whole better-auth
// instance; none of them is used by the public routes.
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/business/import", () => ({
  importService: { startContactImport: contactImportService.startImport },
}))

await import("@/features/contacts/api/public/crud")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const workspace = { id: "workspace-1" }

const memberContext = (permissions: Record<string, boolean>) => ({
  workspace,
  member: { userId: "user-7", workspaceId: "workspace-1", permissions },
})

const ASSIGNED_ONLY = {
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: false,
}
const FULL_ACCESS = { contacts: true, emailAndPhone: true }
const NO_CONTACTS = { analytics: true }

const notFound = Object.assign(new Error("Contact not found"), {
  code: "notFound",
})

beforeEach(() => {
  vi.clearAllMocks()
  resolveContactId.mockResolvedValue("contact-1")
  findByIdOrFail.mockResolvedValue({ id: "contact-1" })
})

describe("contacts.list / count / search for a mobile member", () => {
  const list = findProcedure("GET", "/v1/contacts")
  const count = findProcedure("GET", "/v1/contacts/count")
  const search = findProcedure("POST", "/v1/contacts/search")
  const empty = {
    data: [],
    pageCount: 0,
    totalCount: 0,
    totalCountCapped: false,
  }

  test.each([
    ["list", list],
    ["count", count],
    ["search", search],
  ])("%s is restricted to the agent's assigned contacts and masks email/phone", async (_name, procedure) => {
    listContacts.mockResolvedValue(empty)
    countContacts.mockResolvedValue({ total: 0 })

    await procedure.handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { page: 1, perPage: 20 },
    })

    const call = (procedure === count ? countContacts : listContacts).mock
      .calls[0][0]
    expect(call.scope).toEqual({
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-7",
    })
  })

  test("a member with full contacts access is not restricted to assigned contacts", async () => {
    listContacts.mockResolvedValue(empty)

    await list.handler?.({
      context: memberContext(FULL_ACCESS),
      input: { page: 1, perPage: 20 },
    })

    expect(listContacts.mock.calls[0][0].scope).toEqual({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
  })

  test("a member with no contacts/inbox access is refused with not found", async () => {
    await expect(
      list.handler?.({
        context: memberContext(NO_CONTACTS),
        input: { page: 1, perPage: 20 },
      }),
    ).rejects.toThrow("Contact not found")
    expect(listContacts).not.toHaveBeenCalled()
  })

  test("a workspace token keeps the unscoped, workspace-level read", async () => {
    listContacts.mockResolvedValue(empty)

    await list.handler?.({
      context: { workspace },
      input: { page: 1, perPage: 20 },
    })

    expect(listContacts.mock.calls[0][0].scope).toBe("unscoped")
    expect(findByIdOrFail).not.toHaveBeenCalled()
  })
})

describe("per-contact routes for a mobile member", () => {
  test("GET contact checks the contact is inside the agent's assigned scope", async () => {
    findPublicContactOrFail.mockResolvedValue({
      id: "contact-1",
      email: "ada@example.com",
      phoneNumber: "+84123",
      avatar: null,
    })

    const result = await findProcedure(
      "GET",
      "/v1/contacts/{identifier}",
    ).handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { identifier: "id:contact-1" },
    })

    expect(findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
      accessScope: { restrictToAssignedUserId: "user-7" },
    })
    // No emailAndPhone permission: PII is masked.
    expect(result).toMatchObject({ email: null, phoneNumber: null })
  })

  test("GET contact keeps PII for a member with the emailAndPhone permission", async () => {
    findPublicContactOrFail.mockResolvedValue({
      id: "contact-1",
      email: "ada@example.com",
      phoneNumber: "+84123",
      avatar: null,
    })

    const result = await findProcedure(
      "GET",
      "/v1/contacts/{identifier}",
    ).handler?.({
      context: memberContext(FULL_ACCESS),
      input: { identifier: "id:contact-1" },
    })

    expect(result).toMatchObject({
      email: "ada@example.com",
      phoneNumber: "+84123",
    })
  })

  test.each([
    ["GET", "/v1/contacts/{identifier}", {}],
    ["PATCH", "/v1/contacts/{identifier}", { firstName: "Ada" }],
    ["DELETE", "/v1/contacts/{identifier}", {}],
    ["POST", "/v1/contacts/{identifier}/block", {}],
    ["POST", "/v1/contacts/{identifier}/unblock", {}],
  ])("%s %s on a contact outside the agent's scope is not found and changes nothing", async (method, path, extra) => {
    findByIdOrFail.mockRejectedValue(notFound)

    await expect(
      findProcedure(method, path).handler?.({
        context: memberContext(ASSIGNED_ONLY),
        input: { identifier: "id:contact-9", ...extra },
      }),
    ).rejects.toThrow("Contact not found")

    expect(findPublicContactOrFail).not.toHaveBeenCalled()
    expect(deleteContact).not.toHaveBeenCalled()
    expect(blockAndRecord).not.toHaveBeenCalled()
    expect(unblockAndRecord).not.toHaveBeenCalled()
    expect(updateContactFields).not.toHaveBeenCalled()
  })

  test("a member without contacts access cannot even probe a contact", async () => {
    await expect(
      findProcedure("DELETE", "/v1/contacts/{identifier}").handler?.({
        context: memberContext(NO_CONTACTS),
        input: { identifier: "id:contact-1" },
      }),
    ).rejects.toThrow("Contact not found")

    expect(findByIdOrFail).not.toHaveBeenCalled()
    expect(deleteContact).not.toHaveBeenCalled()
  })

  test("an in-scope delete goes through", async () => {
    deleteContact.mockResolvedValue(undefined)

    await findProcedure("DELETE", "/v1/contacts/{identifier}").handler?.({
      context: memberContext(ASSIGNED_ONLY),
      input: { identifier: "id:contact-1" },
    })

    expect(deleteContact).toHaveBeenCalledWith({
      triggerSource: "api",
      workspaceId: "workspace-1",
      ids: ["contact-1"],
    })
  })

  test("a workspace token is never scope-checked", async () => {
    deleteContact.mockResolvedValue(undefined)

    await findProcedure("DELETE", "/v1/contacts/{identifier}").handler?.({
      context: { workspace },
      input: { identifier: "id:contact-1" },
    })

    expect(findByIdOrFail).not.toHaveBeenCalled()
    expect(deleteContact).toHaveBeenCalled()
  })
})
