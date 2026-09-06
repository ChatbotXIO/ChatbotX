import { beforeEach, describe, expect, test, vi } from "vitest"

// Runtime coercion (boolean/number) reaches EVERY id-based `setValues` caller
// (the trigger worker, flow steps, public APIs) through the single normalize
// call inside `writeValues`. This file:
// - proves boolean/number values are coerced/validated end to end through the
//   real `setValues`/`setValueByKey` funnel (not just unit-tested in
//   isolation on `normalizeCustomFieldValueForStorage`);
// - proves there is exactly ONE normalization call per field per write — the
//   structural guarantee `setValueByKey` relies on (it forwards the raw value
//   into `setValues` without pre-normalizing).

const mocks = vi.hoisted(() => ({
  customFieldFindFirst: vi.fn(),
  customFieldFindMany: vi.fn(),
  contactCustomFieldFindMany: vi.fn(),
  contactFindFirst: vi.fn(),
  workspaceFindFirst: vi.fn(),
  insertValues: vi.fn(),
  insertOnConflict: vi.fn(async () => undefined),
  updateSet: vi.fn(),
  updateWhere: vi.fn(async () => undefined),
  emitCustomFieldChanged: vi.fn(async () => undefined),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const dbMock = {
    query: {
      customFieldModel: {
        findFirst: mocks.customFieldFindFirst,
        findMany: mocks.customFieldFindMany,
      },
      contactCustomFieldModel: { findMany: mocks.contactCustomFieldFindMany },
      contactModel: { findFirst: mocks.contactFindFirst },
      workspaceModel: { findFirst: mocks.workspaceFindFirst },
    },
    update: () => ({
      set: (value: unknown) => {
        mocks.updateSet(value)
        return { where: mocks.updateWhere }
      },
    }),
    insert: () => ({
      values: (value: unknown) => {
        mocks.insertValues(value)
        return { onConflictDoUpdate: mocks.insertOnConflict }
      },
    }),
    transaction: (cb: (tx: unknown) => unknown) => cb(dbMock),
  }

  return { db: dbMock, and: vi.fn(), eq: vi.fn(), inArray: vi.fn() }
})

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: mocks.emitCustomFieldChanged,
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

// Spy on the REAL normalizer (importOriginal) so behavior is unchanged but
// call count is observable — the "no double-normalization" proof.
const normalizeSpy = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock("../src/contact-custom-field/normalize", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/contact-custom-field/normalize")
    >()
  normalizeSpy.fn = vi.fn(actual.normalizeCustomFieldValueForStorage)
  return { ...actual, normalizeCustomFieldValueForStorage: normalizeSpy.fn }
})

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)

const BOOLEAN_FIELD = { id: "cf-bool", name: "subscribed", type: "boolean" }
const NUMBER_FIELD = { id: "cf-num", name: "score", type: "number" }

const NON_CANONICAL_BOOLEAN_RE = /Non-canonical boolean/
const NON_CANONICAL_NUMBER_RE = /Non-canonical number/

describe("setValues — boolean/number runtime coercion end to end", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    normalizeSpy.fn.mockClear()
    mocks.contactCustomFieldFindMany.mockResolvedValue([])
    mocks.contactFindFirst.mockResolvedValue({ timezone: "UTC" })
    mocks.workspaceFindFirst.mockResolvedValue({ timezone: "UTC" })
  })

  test("coerces a widened boolean literal to canonical true", async () => {
    mocks.customFieldFindMany.mockResolvedValue([BOOLEAN_FIELD])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-bool", value: "YES" }],
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ customFieldId: "cf-bool", value: "true" }),
    )
  })

  test("coerces an unrecognized boolean literal to true instead of throwing", async () => {
    mocks.customFieldFindMany.mockResolvedValue([BOOLEAN_FIELD])

    await expect(
      contactCustomFieldService.setValues({
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [{ customFieldId: "cf-bool", value: "12313" }],
      }),
    ).resolves.toBeUndefined()

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ customFieldId: "cf-bool", value: "true" }),
    )
  })

  test("canonicalizes a number value", async () => {
    mocks.customFieldFindMany.mockResolvedValue([NUMBER_FIELD])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-num", value: "007" }],
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ customFieldId: "cf-num", value: "7" }),
    )
  })

  test("rejects an invalid number with a typed error and persists nothing", async () => {
    mocks.customFieldFindMany.mockResolvedValue([NUMBER_FIELD])

    await expect(
      contactCustomFieldService.setValues({
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [{ customFieldId: "cf-num", value: "1aaa1" }],
      }),
    ).rejects.toMatchObject({ code: "invalidCustomFieldValue" })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("normalizes exactly once per field via setValues", async () => {
    mocks.customFieldFindMany.mockResolvedValue([BOOLEAN_FIELD, NUMBER_FIELD])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [
        { customFieldId: "cf-bool", value: "yes" },
        { customFieldId: "cf-num", value: "42" },
      ],
    })

    expect(normalizeSpy.fn).toHaveBeenCalledTimes(2)
  })

  test("setValueByKey (id-based lookup, the trigger-action path) forwards the raw value to setValues without pre-normalizing — exactly one normalize call", async () => {
    mocks.customFieldFindFirst.mockResolvedValue({ id: "cf-bool" })
    mocks.customFieldFindMany.mockResolvedValue([BOOLEAN_FIELD])

    await contactCustomFieldService.setValueByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "cf-bool",
      value: "on",
    })

    expect(normalizeSpy.fn).toHaveBeenCalledTimes(1)
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ customFieldId: "cf-bool", value: "true" }),
    )
  })
})

describe("insertNormalizedValuesForNewContacts — canonical-contract guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const entriesWith = (customFieldId: string, value: string) => [
    { contactId: "contact-1", fields: [{ customFieldId, value }] },
  ]

  test("canonical boolean/number values pass through and insert", async () => {
    mocks.customFieldFindMany.mockResolvedValue([BOOLEAN_FIELD, NUMBER_FIELD])

    await contactCustomFieldService.insertNormalizedValuesForNewContacts({
      workspaceId: "ws-1",
      entries: [
        {
          contactId: "contact-1",
          fields: [
            { customFieldId: "cf-bool", value: "true" },
            { customFieldId: "cf-num", value: "1.5" },
          ],
        },
      ],
    })

    expect(mocks.insertValues).toHaveBeenCalledTimes(1)
  })

  test("non-canonical boolean is rejected before any insert", async () => {
    mocks.customFieldFindMany.mockResolvedValue([BOOLEAN_FIELD])

    await expect(
      contactCustomFieldService.insertNormalizedValuesForNewContacts({
        workspaceId: "ws-1",
        entries: entriesWith("cf-bool", "TRUE"),
      }),
    ).rejects.toThrow(NON_CANONICAL_BOOLEAN_RE)
    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("non-canonical number is rejected before any insert", async () => {
    mocks.customFieldFindMany.mockResolvedValue([NUMBER_FIELD])

    await expect(
      contactCustomFieldService.insertNormalizedValuesForNewContacts({
        workspaceId: "ws-1",
        entries: entriesWith("cf-num", "007"),
      }),
    ).rejects.toThrow(NON_CANONICAL_NUMBER_RE)
    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("blank values and non-boolean/number types stay on the caller's contract", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      BOOLEAN_FIELD,
      { id: "cf-text", name: "note", type: "shortText" },
    ])

    await contactCustomFieldService.insertNormalizedValuesForNewContacts({
      workspaceId: "ws-1",
      entries: [
        {
          contactId: "contact-1",
          fields: [
            { customFieldId: "cf-bool", value: "" },
            { customFieldId: "cf-text", value: "  anything goes  " },
          ],
        },
      ],
    })

    expect(mocks.insertValues).toHaveBeenCalledTimes(1)
  })
})
