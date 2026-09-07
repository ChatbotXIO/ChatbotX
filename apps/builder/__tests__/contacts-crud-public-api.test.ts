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

const contactImportService = { startImport: vi.fn() }

vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    inboxResource: actual.inboxResource,
    contactService: {
      list: listContacts,
      count: countContacts,
      resolveIdByIdentifier: resolveContactId,
      findPublicContactOrFail,
      createWithInbox: createContact,
      deleteAndRecord: deleteContact,
      updateFieldsAndCustomFields: updateContactFields,
      listByCustomFieldValue,
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
    })
  })
})
