import { beforeEach, describe, expect, test, vi } from "vitest"

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

const contactCustomFieldService = {
  setValues: vi.fn(),
  deleteByKey: vi.fn(),
  clearByContactId: vi.fn(),
}
const tagService = { attachToContact: vi.fn(), detachFromContact: vi.fn() }

const resolveContactId = vi.fn()

const addContactCustomFields = vi.fn()
const setContactCustomFieldValue = vi.fn()

const updateContactTags = vi.fn()

const addContactTags = vi.fn()

const findContactCustomField = vi.fn()
const listContactCustomFields = vi.fn()
vi.mock("../src/features/contacts/queries/list-contact-fields.query", () => ({
  findContactCustomField,
  listContactCustomFields,
}))

const listContactTags = vi.fn()
vi.mock("../src/features/contacts/queries/list-contact-tags.query", () => ({
  listContactTags,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
  tagService: {
    ...tagService,
    attachByNamesToContacts: addContactTags,
    replaceContactTagsByNames: updateContactTags,
  },
  contactCustomFieldService: {
    ...contactCustomFieldService,
    applyOperationToContacts: addContactCustomFields,
    setValueForContact: setContactCustomFieldValue,
  },
}))

await import("@/features/contacts/api/public/tags")
await import("@/features/contacts/api/public/custom-fields")

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
  resolveContactId.mockResolvedValue("contact-1")
})

describe("POST /v1/contacts/{identifier}/tags/by-name", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/contacts/{identifier}/tags/by-name",
  )

  test("delegates to addContactTags with the resolved contact id", async () => {
    addContactTags.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", tags: ["VIP"] },
    })

    expect(addContactTags).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      names: ["VIP"],
    })
  })
})

describe("PUT /v1/contacts/{identifier}/tags", () => {
  const procedure = findProcedure("PUT", "/v1/contacts/{identifier}/tags")

  test("replaces all tags on the contact by name via updateContactTags", async () => {
    updateContactTags.mockResolvedValueOnce([])

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", tags: ["VIP", "Newsletter"] },
    })

    expect(updateContactTags).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      names: ["VIP", "Newsletter"],
    })
  })
})

describe("PATCH /v1/contacts/{identifier}/custom-fields", () => {
  const procedure = findProcedure(
    "PATCH",
    "/v1/contacts/{identifier}/custom-fields",
  )

  test("maps friendly operation names to internal FieldOperationType codes", async () => {
    addContactCustomFields.mockResolvedValue(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        identifier: "id:123",
        operations: [
          { customFieldId: "cf-1", operation: "increase", value: "1" },
        ],
      },
    })

    expect(addContactCustomFields).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "O04",
      value: "1",
    })
  })

  test("applies operations in order, one call per operation", async () => {
    addContactCustomFields.mockResolvedValue(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        identifier: "id:123",
        operations: [
          { customFieldId: "cf-1", operation: "set", value: "a" },
          { customFieldId: "cf-1", operation: "append", value: "b" },
        ],
      },
    })

    expect(addContactCustomFields).toHaveBeenCalledTimes(2)
    expect(addContactCustomFields).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "O01",
      value: "a",
    })
    expect(addContactCustomFields).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "O02",
      value: "b",
    })
  })
})
