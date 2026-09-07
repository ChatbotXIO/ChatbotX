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

const applyCustomFieldOperations = vi.fn()
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
    applyOperations: applyCustomFieldOperations,
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

describe("GET /v1/contacts/{identifier}/tags", () => {
  const procedure = findProcedure("GET", "/v1/contacts/{identifier}/tags")

  test("resolves the contact id via resolveIdByIdentifier, then returns listContactTags", async () => {
    const tags = [{ id: "tag-1", name: "VIP" }]
    listContactTags.mockResolvedValueOnce(tags)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(listContactTags).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
    expect(result).toEqual(tags)
  })
})

describe("POST /v1/contacts/{identifier}/tags", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/tags")

  test("resolves the contact id via resolveIdByIdentifier before attaching tags", async () => {
    tagService.attachToContact.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", tagIds: ["tag-1", "tag-2"] },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(tagService.attachToContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      tagIds: ["tag-1", "tag-2"],
    })
  })
})

describe("DELETE /v1/contacts/{identifier}/tags", () => {
  const procedure = findProcedure("DELETE", "/v1/contacts/{identifier}/tags")

  test("resolves the contact id via resolveIdByIdentifier before detaching tags", async () => {
    tagService.detachFromContact.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", tagIds: ["tag-1"] },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(tagService.detachFromContact).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      tagIds: ["tag-1"],
    })
  })
})

describe("GET /v1/contacts/{identifier}/custom-fields", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/contacts/{identifier}/custom-fields",
  )

  test("resolves the contact id via resolveIdByIdentifier, then returns listContactCustomFields", async () => {
    const fields = [{ customFieldId: "cf-1", value: "a" }]
    listContactCustomFields.mockResolvedValueOnce(fields)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(listContactCustomFields).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
    expect(result).toEqual(fields)
  })
})

describe("GET /v1/contacts/{identifier}/custom-fields/{customFieldId}", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
  )

  test("resolves the contact id via resolveIdByIdentifier, then returns findContactCustomField", async () => {
    const field = { customFieldId: "cf-1", value: "a" }
    findContactCustomField.mockResolvedValueOnce(field)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", customFieldId: "cf-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(findContactCustomField).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "cf-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual(field)
  })
})

describe("POST /v1/contacts/{identifier}/custom-fields/{customFieldId}", () => {
  const procedure = findProcedure(
    "POST",
    "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
  )

  test("resolves the contact id via resolveIdByIdentifier before setting the value", async () => {
    setContactCustomFieldValue.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", customFieldId: "cf-1", value: "hello" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(setContactCustomFieldValue).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      customFieldId: "cf-1",
      value: "hello",
    })
  })
})

describe("PUT /v1/contacts/{identifier}/custom-fields", () => {
  const procedure = findProcedure(
    "PUT",
    "/v1/contacts/{identifier}/custom-fields",
  )

  test("resolves the contact id via resolveIdByIdentifier before setting multiple values", async () => {
    contactCustomFieldService.setValues.mockResolvedValueOnce(undefined)

    const fields = [
      { customFieldId: "cf-1", value: "a" },
      { customFieldId: "cf-2", value: "b" },
    ]
    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", fields },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(contactCustomFieldService.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields,
    })
  })
})

describe("DELETE /v1/contacts/{identifier}/custom-fields/{idOrName}", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/contacts/{identifier}/custom-fields/{idOrName}",
  )

  test("resolves the contact id via resolveIdByIdentifier before deleting by key", async () => {
    contactCustomFieldService.deleteByKey.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", idOrName: "cf-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(contactCustomFieldService.deleteByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      keyword: "cf-1",
    })
  })
})

describe("DELETE /v1/contacts/{identifier}/custom-fields", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/contacts/{identifier}/custom-fields",
  )

  test("resolves the contact id via resolveIdByIdentifier before clearing all custom fields", async () => {
    contactCustomFieldService.clearByContactId.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(contactCustomFieldService.clearByContactId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })
  })
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
    applyCustomFieldOperations.mockResolvedValue(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        identifier: "id:123",
        operations: [
          { customFieldId: "cf-1", operation: "increase", value: "1" },
        ],
      },
    })

    expect(applyCustomFieldOperations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      operations: [{ customFieldId: "cf-1", operation: "O04", value: "1" }],
    })
  })

  test("makes a single applyOperations call carrying every operation in order", async () => {
    applyCustomFieldOperations.mockResolvedValue(undefined)

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

    expect(applyCustomFieldOperations).toHaveBeenCalledTimes(1)
    expect(applyCustomFieldOperations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      operations: [
        { customFieldId: "cf-1", operation: "O01", value: "a" },
        { customFieldId: "cf-1", operation: "O02", value: "b" },
      ],
    })
  })
})
