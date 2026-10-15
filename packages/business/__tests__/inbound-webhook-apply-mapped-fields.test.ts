import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyRichSystemFields: vi.fn(),
  update: vi.fn(),
  setValues: vi.fn(),
}))

vi.mock("../src/contact/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/contact/service")>()
  return {
    ...actual,
    contactService: {
      applyRichSystemFields: mocks.applyRichSystemFields,
      update: mocks.update,
    },
  }
})
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: { setValues: mocks.setValues },
}))

const { applyMappedContactFields, toRichSystemFields, writableFields } =
  await import("../src/inbound-webhook/apply-mapped-fields")

type Field = Parameters<typeof applyMappedContactFields>[0]["fields"][number]

const field = (overrides: Partial<Field>): Field => ({
  target: "first_name",
  kind: "richSystem",
  raw: "x",
  value: "x",
  error: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("writableFields", () => {
  test("keeps only fields that have a value and no error", () => {
    const fields = [
      field({ target: "a", value: "1" }),
      field({ target: "b", value: null, raw: null }),
      field({ target: "c", value: null, error: "invalidValue" }),
    ]

    expect(writableFields(fields).map(({ target }) => target)).toEqual(["a"])
  })
})

describe("toRichSystemFields", () => {
  test("collects only system-field targets", () => {
    expect(
      toRichSystemFields([
        field({ target: "first_name", value: "John" }),
        field({ target: "phone", value: "+84901234567" }),
        field({ target: "100", kind: "customField", value: "5" }),
        field({ target: "gender", kind: "gender", value: "male" }),
      ]),
    ).toEqual({ first_name: "John", phone: "+84901234567" })
  })

  test("a repeated target takes the later row's value and position", () => {
    const fields = toRichSystemFields([
      field({ target: "first_name", value: "Initial" }),
      field({ target: "full_name", value: "John Smith" }),
      field({ target: "first_name", value: "Final" }),
    ])

    expect(Object.entries(fields)).toEqual([
      ["full_name", "John Smith"],
      ["first_name", "Final"],
    ])
  })
})

describe("applyMappedContactFields", () => {
  test("writes every kind with the fewest statements", async () => {
    await applyMappedContactFields({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [
        field({ target: "first_name", value: "John" }),
        field({ target: "email", value: "j@x.co" }),
        field({ target: "gender", kind: "gender", value: "male" }),
        field({ target: "100", kind: "customField", value: "125.5" }),
        field({ target: "101", kind: "customField", value: "ORD-1" }),
      ],
    })

    expect(mocks.applyRichSystemFields).toHaveBeenCalledTimes(1)
    expect(mocks.applyRichSystemFields).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: { first_name: "John", email: "j@x.co" },
    })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "c-1" },
      { gender: "male" },
    )
    expect(mocks.setValues).toHaveBeenCalledTimes(1)
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [
        { customFieldId: "100", value: "125.5" },
        { customFieldId: "101", value: "ORD-1" },
      ],
      temporalInputParsing: "lenient",
    })
  })

  test("the last gender row wins and custom-field events carry the resolved inbox", async () => {
    await applyMappedContactFields({
      workspaceId: "ws-1",
      contactId: "c-1",
      contactInboxId: "ci-1",
      fields: [
        field({ target: "gender", kind: "gender", value: "male" }),
        field({ target: "gender", kind: "gender", value: "female" }),
        field({ target: "100", kind: "customField", value: "1" }),
      ],
    })

    expect(mocks.update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "c-1" },
      { gender: "female" },
    )
    expect(mocks.setValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-1" }),
    )
  })

  test("issues no statement for a kind with nothing to write", async () => {
    await applyMappedContactFields({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [field({ target: "100", kind: "customField", value: "1" })],
    })

    expect(mocks.applyRichSystemFields).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.setValues).toHaveBeenCalledTimes(1)
  })

  test("does nothing for no fields", async () => {
    await applyMappedContactFields({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [],
    })

    expect(mocks.applyRichSystemFields).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })
})
