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
const findCustomFieldByKeyOrFail = vi.fn()
const findCustomFieldsByKeys = vi.fn()
const tagService = { attachToContact: vi.fn(), detachFromContact: vi.fn() }

const resolveContactId = vi.fn()

const applyCustomFieldOperations = vi.fn()
const setContactCustomFieldValue = vi.fn()

const updateContactTags = vi.fn()

const addContactTags = vi.fn()

const findContactCustomField = vi.fn()
const listContactCustomFields = vi.fn()
vi.mock("../src/features/contacts/lib/list-contact-fields", () => ({
  findContactCustomField,
  listContactCustomFields,
}))

const listContactTags = vi.fn()
vi.mock("../src/features/contacts/lib/list-contact-tags", () => ({
  listContactTags,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: { resolveIdByIdentifier: resolveContactId },
  customFieldService: {
    findByKeyOrFail: findCustomFieldByKeyOrFail,
    findManyByKeys: findCustomFieldsByKeys,
  },
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

describe("GET /v1/contacts/{identifier}/custom-fields/{idOrName}", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/contacts/{identifier}/custom-fields/{idOrName}",
  )

  test("resolves the contact id and the field by id, then returns findContactCustomField", async () => {
    const field = { customFieldId: "cf-1", value: "a" }
    findCustomFieldByKeyOrFail.mockResolvedValueOnce({ id: "cf-1" })
    findContactCustomField.mockResolvedValueOnce(field)

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", idOrName: "cf-1" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(findCustomFieldByKeyOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "cf-1",
    })
    expect(findContactCustomField).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "cf-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual(field)
  })

  test("resolves the field by name", async () => {
    findCustomFieldByKeyOrFail.mockResolvedValueOnce({ id: "cf-2" })
    findContactCustomField.mockResolvedValueOnce({
      customFieldId: "cf-2",
      value: "b",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", idOrName: "Full Name" },
    })

    expect(findCustomFieldByKeyOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "Full Name",
    })
    expect(findContactCustomField).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "cf-2",
      workspaceId: "workspace-1",
    })
  })
})

describe("PUT /v1/contacts/{identifier}/custom-fields/{idOrName}", () => {
  const procedure = findProcedure(
    "PUT",
    "/v1/contacts/{identifier}/custom-fields/{idOrName}",
  )

  test("resolves the contact id and the field by id before setting the value", async () => {
    findCustomFieldByKeyOrFail.mockResolvedValueOnce({ id: "cf-1" })
    setContactCustomFieldValue.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", idOrName: "cf-1", value: "hello" },
    })

    expect(resolveContactId).toHaveBeenCalledWith({
      identifier: "id:123",
      workspaceId: "workspace-1",
    })
    expect(findCustomFieldByKeyOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "cf-1",
    })
    expect(setContactCustomFieldValue).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      customFieldId: "cf-1",
      value: "hello",
    })
  })

  test("forwards the caller's clientTimezone to anchor a date value", async () => {
    findCustomFieldByKeyOrFail.mockResolvedValueOnce({ id: "cf-1" })
    setContactCustomFieldValue.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        identifier: "id:123",
        idOrName: "cf-1",
        value: "2026-10-03",
        clientTimezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(setContactCustomFieldValue).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTimezone: "Asia/Ho_Chi_Minh" }),
    )
  })

  test("resolves the field by name before setting the value", async () => {
    findCustomFieldByKeyOrFail.mockResolvedValueOnce({ id: "cf-2" })
    setContactCustomFieldValue.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { identifier: "id:123", idOrName: "Full Name", value: "hello" },
    })

    expect(findCustomFieldByKeyOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "Full Name",
    })
    expect(setContactCustomFieldValue).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      customFieldId: "cf-2",
      value: "hello",
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
  const fieldsByKey = (...entries: [string, string][]) =>
    new Map(entries.map(([key, id]) => [key, { id }]))
  const patch = (
    operations: Array<{
      customFieldId: string
      operation: string
      value?: string
    }>,
    extra: Record<string, unknown> = {},
  ) =>
    procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        identifier: "id:123",
        operations: operations.map((operation) => ({
          value: "",
          ...operation,
        })),
        ...extra,
      },
    })

  beforeEach(() => {
    applyCustomFieldOperations.mockResolvedValue(undefined)
  })

  test("maps friendly operation names to internal FieldOperationType codes", async () => {
    findCustomFieldsByKeys.mockResolvedValue(fieldsByKey(["cf-1", "cf-1"]))

    await patch([{ customFieldId: "cf-1", operation: "increase", value: "1" }])

    expect(applyCustomFieldOperations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      operations: [{ customFieldId: "cf-1", operation: "O04", value: "1" }],
    })
  })

  test.each([
    ["clear", "O06"],
    ["setNow", "O08"],
    ["formula", "O07"],
    ["dateExpression", "O09"],
    ["addMinutes", "O10"],
    ["addHours", "O11"],
    ["addDays", "O12"],
  ])("maps the %s operation to %s", async (operation, code) => {
    findCustomFieldsByKeys.mockResolvedValue(fieldsByKey(["cf-1", "cf-1"]))

    await patch([{ customFieldId: "cf-1", operation, value: "1" }])

    expect(applyCustomFieldOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [{ customFieldId: "cf-1", operation: code, value: "1" }],
      }),
    )
  })

  test("resolves every field by id or name in one lookup before applying", async () => {
    findCustomFieldsByKeys.mockResolvedValue(
      fieldsByKey(["Loyalty Points", "cf-1"], ["cf-2", "cf-2"]),
    )

    await patch([
      { customFieldId: "Loyalty Points", operation: "increase", value: "1" },
      { customFieldId: "cf-2", operation: "set", value: "x" },
    ])

    expect(findCustomFieldsByKeys).toHaveBeenCalledTimes(1)
    expect(findCustomFieldsByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      keys: ["Loyalty Points", "cf-2"],
    })
    expect(applyCustomFieldOperations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      operations: [
        { customFieldId: "cf-1", operation: "O04", value: "1" },
        { customFieldId: "cf-2", operation: "O01", value: "x" },
      ],
    })
  })

  test("an unknown field fails the request before anything is applied", async () => {
    findCustomFieldsByKeys.mockResolvedValue(fieldsByKey(["cf-1", "cf-1"]))

    await expect(
      patch([
        { customFieldId: "cf-1", operation: "set", value: "a" },
        { customFieldId: "missing", operation: "set", value: "b" },
      ]),
    ).rejects.toThrow("Custom field not found")
    expect(applyCustomFieldOperations).not.toHaveBeenCalled()
  })

  test("makes a single applyOperations call carrying every operation in order", async () => {
    findCustomFieldsByKeys.mockResolvedValue(fieldsByKey(["cf-1", "cf-1"]))

    await patch([
      { customFieldId: "cf-1", operation: "set", value: "a" },
      { customFieldId: "cf-1", operation: "append", value: "b" },
    ])

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

  test("forwards clientTimezone for the whole batch", async () => {
    findCustomFieldsByKeys.mockResolvedValue(fieldsByKey(["cf-1", "cf-1"]))

    await patch([{ customFieldId: "cf-1", operation: "set", value: "x" }], {
      clientTimezone: "America/New_York",
    })

    expect(applyCustomFieldOperations).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTimezone: "America/New_York" }),
    )
  })
})

describe("custom-field operation request schema", () => {
  const parse = async (operations: unknown[]) => {
    const { addContactCustomFieldOperationsPublicRequest: schema } =
      await import("@/features/contacts/schema/public/custom-fields")
    return schema.safeParse({ identifier: "id:1", operations })
  }

  test.each(["clear", "setNow"])("%s needs no value", async (operation) => {
    expect((await parse([{ customFieldId: "1", operation }])).success).toBe(
      true,
    )
  })

  test.each([
    "formula",
    "dateExpression",
    "addDays",
    "addHours",
    "addMinutes",
  ])("%s requires a value", async (operation) => {
    expect((await parse([{ customFieldId: "1", operation }])).success).toBe(
      false,
    )
  })

  test("legacy operations keep accepting a blank value", async () => {
    expect(
      (await parse([{ customFieldId: "1", operation: "increase", value: "" }]))
        .success,
    ).toBe(true)
  })

  test.each([
    "constructor",
    "O04",
    "multiply",
  ])("rejects the unknown operation %s", async (operation) => {
    expect(
      (await parse([{ customFieldId: "1", operation, value: "1" }])).success,
    ).toBe(false)
  })
})

describe("PATCH custom-fields: schema output feeds the handler", () => {
  const procedure = findProcedure(
    "PATCH",
    "/v1/contacts/{identifier}/custom-fields",
  )

  test.each([
    [" x ", "x"],
    ["   ", ""],
  ])("append value %j reaches the service as %j", async (raw, expected) => {
    const { addContactCustomFieldOperationsPublicRequest: schema } =
      await import("@/features/contacts/schema/public/custom-fields")
    const parsed = schema.parse({
      identifier: "id:123",
      operations: [{ customFieldId: "cf-1", operation: "append", value: raw }],
    })
    findCustomFieldsByKeys.mockResolvedValue(
      new Map([["cf-1", { id: "cf-1" }]]),
    )
    applyCustomFieldOperations.mockResolvedValue(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: parsed,
    })

    expect(applyCustomFieldOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [
          { customFieldId: "cf-1", operation: "O02", value: expected },
        ],
      }),
    )
  })

  test("an unknown custom field is a 404 'Custom field not found'", async () => {
    findCustomFieldsByKeys.mockResolvedValue(new Map())

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          identifier: "id:123",
          operations: [{ customFieldId: "nope", operation: "set", value: "" }],
        },
      }),
    ).rejects.toMatchObject({
      message: "Custom field not found",
      code: "notFound",
    })
  })
})

describe("clientTimezone validation", () => {
  test("an unknown IANA zone is rejected instead of silently becoming UTC", async () => {
    const { addContactCustomFieldOperationsPublicRequest: schema } =
      await import("@/features/contacts/schema/public/custom-fields")
    const base = {
      identifier: "id:1",
      operations: [{ customFieldId: "1", operation: "set", value: "x" }],
    }

    expect(
      schema.safeParse({ ...base, clientTimezone: "Asia/Ho_Chi_Minh" }).success,
    ).toBe(true)
    expect(
      schema.safeParse({ ...base, clientTimezone: "Asia/Hanoi" }).success,
    ).toBe(false)
  })
})
