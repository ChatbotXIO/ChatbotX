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
const listByCustomFieldValue = vi.fn()

const createContact = vi.fn()

const deleteContact = vi.fn()

const updateContactFields = vi.fn()

const blockAndRecord = vi.fn()
const unblockAndRecord = vi.fn()
const upsertByIdentifier = vi.fn()

const contactImportService = { startImport: vi.fn() }

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
      listByCustomFieldValue,
      blockAndRecord,
      unblockAndRecord,
      upsertByIdentifier,
    },
    importService: { startContactImport: contactImportService.startImport },
  }
})

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /v1/contacts", () => {
  const procedure = findProcedure("GET", "/v1/contacts")

  test("passes include/withCount through as separate options, not merged into the query filter", async () => {
    listContacts.mockResolvedValueOnce({
      data: [],
      pageCount: 0,
      totalCount: 0,
      totalCountCapped: false,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        page: 1,
        perPage: 20,
        include: ["tags"],
        withCount: false,
      },
    })

    expect(listContacts).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      workspaceId: "workspace-1",
      // The workspace-token surface must opt out of member scoping
      // explicitly, so full PII can never be exposed by a forgotten argument.
      scope: "unscoped",
      include: ["tags"],
      withCount: false,
    })
  })
})

describe("POST /v1/contacts/search", () => {
  const procedure = findProcedure("POST", "/v1/contacts/search")

  test("delegates to the same contactService.list as GET /v1/contacts", async () => {
    listContacts.mockResolvedValueOnce({
      data: [],
      pageCount: 0,
      totalCount: 0,
      totalCountCapped: false,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 20 },
    })

    expect(listContacts).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      workspaceId: "workspace-1",
      scope: "unscoped",
      include: undefined,
      withCount: undefined,
    })
  })
})

describe("GET /v1/contacts/count", () => {
  const procedure = findProcedure("GET", "/v1/contacts/count")

  test("delegates to contactService.count", async () => {
    countContacts.mockResolvedValueOnce({ total: 7 })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 1, perPage: 20 },
      }),
    ).resolves.toEqual({ total: 7 })

    expect(countContacts).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      workspaceId: "workspace-1",
      scope: "unscoped",
    })
  })
})

describe("GET /v1/contacts/{identifier}", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{identifier}")

  test("resolves the contact id via resolveIdByIdentifier, then returns findPublicContactOrFail", async () => {
    resolveContactId.mockResolvedValueOnce("contact-1")
    const publicContact = { id: "contact-1", firstName: "Ada" }
    findPublicContactOrFail.mockResolvedValueOnce(publicContact)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:contact-1",
      workspaceId: "workspace-1",
    })
    expect(findPublicContactOrFail).toHaveBeenCalledWith({
      id: "contact-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual(publicContact)
  })
})

describe("POST /v1/contacts", () => {
  const procedure = findProcedure("POST", "/v1/contacts")

  test("creates the contact then returns the result of findPublicContactOrFail", async () => {
    createContact.mockResolvedValueOnce({ contact: { id: "contact-1" } })
    const publicContact = { id: "contact-1", firstName: "Ada" }
    findPublicContactOrFail.mockResolvedValueOnce(publicContact)

    const input = { firstName: "Ada", inboxId: "inbox-1" }
    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input,
    })

    expect(createContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      input,
    })
    expect(findPublicContactOrFail).toHaveBeenCalledWith({
      id: "contact-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual(publicContact)
  })
})

describe("PUT /v1/contacts/{identifier}", () => {
  const procedure = findProcedure("PUT", "/v1/contacts/{identifier}")

  test("resolves the contact id via resolveIdByIdentifier before updating fields", async () => {
    resolveContactId.mockResolvedValueOnce("contact-1")
    updateContactFields.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1", firstName: "Ada" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:contact-1",
      workspaceId: "workspace-1",
    })
    expect(updateContactFields).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "contact-1" },
      { firstName: "Ada" },
    )
  })
})

describe("DELETE /v1/contacts/{identifier}", () => {
  const procedure = findProcedure("DELETE", "/v1/contacts/{identifier}")

  test("resolves the contact id via resolveIdByIdentifier before deleting", async () => {
    resolveContactId.mockResolvedValueOnce("contact-1")
    deleteContact.mockResolvedValueOnce({
      processedContactIds: ["contact-1"],
      skippedContactIds: [],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:contact-1",
      workspaceId: "workspace-1",
    })
    expect(deleteContact).toHaveBeenCalledWith({
      triggerSource: "api",
      workspaceId: "workspace-1",
      ids: ["contact-1"],
    })
  })
})

describe("POST /v1/contacts/{identifier}/block", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/block")

  test("resolves the contact id via resolveIdByIdentifier before blocking", async () => {
    resolveContactId.mockResolvedValueOnce("contact-1")
    blockAndRecord.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:contact-1",
      workspaceId: "workspace-1",
    })
    expect(blockAndRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
    })
  })
})

describe("POST /v1/contacts/{identifier}/unblock", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/unblock")

  test("resolves the contact id via resolveIdByIdentifier before unblocking", async () => {
    resolveContactId.mockResolvedValueOnce("contact-1")
    unblockAndRecord.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:contact-1",
      workspaceId: "workspace-1",
    })
    expect(unblockAndRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
    })
  })
})

describe("POST /v1/contacts/{identifier}/upsert", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/upsert")

  test("upserts by identifier then returns the result of findPublicContactOrFail", async () => {
    upsertByIdentifier.mockResolvedValueOnce({
      contact: { id: "contact-1" },
      isNew: true,
    })
    const publicContact = { id: "contact-1", firstName: "Ada" }
    findPublicContactOrFail.mockResolvedValueOnce(publicContact)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1", firstName: "Ada" },
    })

    expect(upsertByIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        identifier: "id:contact-1",
        data: { firstName: "Ada" },
      }),
    )
    expect(findPublicContactOrFail).toHaveBeenCalledWith({
      id: "contact-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual(publicContact)
  })

  test("only spreads fields that were actually provided in the input, not blanking unset ones", async () => {
    upsertByIdentifier.mockResolvedValueOnce({
      contact: { id: "contact-1" },
      isNew: false,
    })
    findPublicContactOrFail.mockResolvedValueOnce({ id: "contact-1" })

    // Only lastName provided — firstName/email/phoneNumber/gender are unset.
    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:contact-1", lastName: "Lovelace" },
    })

    expect(upsertByIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastName: "Lovelace" },
      }),
    )
    const call = upsertByIdentifier.mock.calls.at(-1)?.[0]
    expect(call.data).not.toHaveProperty("firstName")
    expect(call.data).not.toHaveProperty("email")
    expect(call.data).not.toHaveProperty("phoneNumber")
    expect(call.data).not.toHaveProperty("gender")
  })
})
