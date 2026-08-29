// @vitest-environment node

import { FieldOperationType } from "@chatbotx.io/flow-config"
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { afterEach, describe, expect, test, vi } from "vitest"

// `sql` is mocked to capture its tagged-template call (strings + interpolated
// values) instead of building a real Postgres fragment, so tests can assert
// which ATOMIC_VALUE_EXPRESSIONS entry fired (by inspecting the literal SQL
// text) without a live database.
const mocks = vi.hoisted(() => {
  const findFirst = vi.fn()
  const findMany = vi.fn()
  const countMock = vi.fn()
  const updateSet = vi.fn()
  const updateWhere = vi.fn()
  const updateReturning = vi.fn()
  const insertValues = vi.fn()
  const insertReturning = vi.fn()
  const workspaceFindFirst = vi.fn()
  const invalidateCacheTags = vi.fn()
  const sqlMock = vi.fn(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: strings.join("?"),
      values,
    }),
  )
  const parseOrderByAsObject = vi.fn(() => "ORDER_BY")
  const parsePagination = vi.fn(() => undefined)
  const relationsFilterToSQL = vi.fn(() => "FILTER_SQL")

  return {
    findFirst,
    findMany,
    countMock,
    updateSet,
    updateWhere,
    updateReturning,
    insertValues,
    insertReturning,
    workspaceFindFirst,
    invalidateCacheTags,
    sqlMock,
    parseOrderByAsObject,
    parsePagination,
    relationsFilterToSQL,
  }
})

// Distinguishable column sentinels so a wrong-model regression (the exact bug
// being regression-tested in `list()`) shows up as a mismatched mock argument.
const botFieldModel = {
  id: "BOT_FIELD_ID_COL",
  workspaceId: "BOT_FIELD_WORKSPACE_ID_COL",
  value: "BOT_FIELD_VALUE_COL",
  type: "BOT_FIELD_TYPE_COL",
  name: "BOT_FIELD_NAME_COL",
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      botFieldModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
      workspaceModel: {
        findFirst: mocks.workspaceFindFirst,
      },
    },
    update: vi.fn(() => ({
      set: (setValue: unknown) => {
        mocks.updateSet(setValue)
        return {
          where: (whereValue: unknown) => {
            mocks.updateWhere(whereValue)
            return { returning: mocks.updateReturning }
          },
        }
      },
    })),
    insert: vi.fn(() => ({
      values: (value: unknown) => {
        mocks.insertValues(value)
        return {
          returning: mocks.insertReturning,
          onConflictDoNothing: () => ({ returning: mocks.insertReturning }),
        }
      },
    })),
    $count: mocks.countMock,
  },
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn(),
  relationsFilterToSQL: mocks.relationsFilterToSQL,
  sql: mocks.sqlMock,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "root",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  botFieldModel,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: (value: string) => value,
  parseOrderByAsObject: mocks.parseOrderByAsObject,
  parsePagination: mocks.parsePagination,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    invalidateCacheTags(...args: unknown[]) {
      return mocks.invalidateCacheTags(...args)
    }
  },
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    constructor(message: string, code?: string) {
      super(message)
      this.name = "ChatbotXException"
      this.code = code ?? "systemError"
    }
  },
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

const { botFieldService } = await import("../src/bot-field/service")
const { ChatbotXException } = await import("../src/errors")

// Zoned day-start ISO for a "now" stamp in Asia/Ho_Chi_Minh (+07:00).
const NOW_STAMPED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T00:00:00\+07:00$/

const existingRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "1",
  workspaceId: "ws-1",
  name: "field",
  type: "shortText",
  value: "before",
  description: null,
  folderId: null,
  ...overrides,
})

describe("botFieldService.list", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("sorts and counts against botFieldModel, not customFieldModel", async () => {
    mocks.findMany.mockResolvedValue([])
    mocks.countMock.mockResolvedValue(0)

    await botFieldService.list({ workspaceId: "ws-1" })

    expect(mocks.parseOrderByAsObject).toHaveBeenCalledWith(
      botFieldModel,
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
    expect(mocks.relationsFilterToSQL).toHaveBeenCalledWith(
      botFieldModel,
      expect.anything(),
    )
    expect(mocks.countMock).toHaveBeenCalledWith(botFieldModel, "FILTER_SQL")
  })
})

describe("botFieldService.applyValueOperation — set", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    ["shortText", "after", "after"],
    ["longText", "after", "after"],
    ["number", "42", "42"],
    ["boolean", "true", "true"],
    ["email", "after", "after"],
    ["phoneNumber", "after", "after"],
  ] as const)("accepts set for non-temporal type %s", async (type, value, expected) => {
    mocks.findFirst.mockResolvedValue(existingRow({ type }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type, value: expected }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value,
    })

    expect(result.value).toBe(expected)
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ value: expected }),
    )
  })

  // Runtime coercion for `boolean`/`number` set values (unified normalizer,
  // see contact-custom-field/normalize.ts) reaches the bot-field `set` path
  // through `normalizeCustomFieldValueForStorage` — pin both here.
  test("coerces an unrecognized boolean-set value to true (generous runtime coercion, never throws)", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "boolean" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "boolean", value: "true" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      // Arbitrary non-empty text, not a recognized boolean literal.
      value: "after",
    })

    expect(result.value).toBe("true")
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "true" })
  })

  test("a blank boolean-set value stays empty — means unset, not false", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "boolean" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "boolean", value: "" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value: "",
    })

    expect(result.value).toBe("")
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "" })
  })

  test("rejects an unparseable number-set value with a typed error instead of persisting garbage", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "number" }))

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.set,
        value: "1aaa1",
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test('canonicalizes a number-set value (e.g. "007" -> "7")', async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "number" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "7" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value: "007",
    })

    expect(result.value).toBe("7")
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "7" })
  })

  test("normalizes a naive date value using the caller's source timezone override", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "date" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "date", value: "2026-07-22T00:00:00+07:00" }),
    ])

    await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value: "2026-07-22",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      value: "2026-07-22T00:00:00+07:00",
    })
  })

  test("normalizes a naive datetime value using the caller's source timezone override", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "datetime" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "datetime", value: "2026-07-22T08:30:00.000Z" }),
    ])

    await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value: "2026-07-22 15:30",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      value: "2026-07-22T08:30:00.000Z",
    })
  })

  test("rejects a date value that cannot be normalized instead of persisting garbage", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "date" }))

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.set,
        value: "not-a-date",
        sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  // Regression coverage for Finding 1: `temporalInputParsing` /
  // `fillEmptyTemporalWithNow` must reach `normalizeCustomFieldValueForStorage`
  // for the bot-field branch, not just the contact-custom-field branch.
  test("accepts a lenient (non-ISO) date value for a date bot field when temporalInputParsing is Lenient", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "date" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "date", value: "2026-07-23T00:00:00+07:00" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      // Day-first "DD/MM/YYYY" — rejected under Strict ISO parsing, accepted
      // by the Lenient multi-format parser.
      value: "23/07/2026",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      temporalInputParsing: TemporalInputParsing.Lenient,
    })

    expect(result.value).toBe("2026-07-23T00:00:00+07:00")
    expect(mocks.updateSet).toHaveBeenCalledWith({
      value: "2026-07-23T00:00:00+07:00",
    })
  })

  test("rejects the same lenient-only value under the Strict default, proving Lenient was actually forwarded", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "date" }))

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.set,
        value: "23/07/2026",
        sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("a blank value with fillEmptyTemporalWithNow stamps the current date instead of persisting an empty string", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "date" }))
    // The normalizer computes the real current date, so the exact value is
    // not asserted here — only that a non-empty, normalized value was
    // written instead of the blank input.
    mocks.updateReturning.mockImplementation(async () => [
      existingRow({
        type: "date",
        value: mocks.updateSet.mock.calls[0]?.[0]?.value,
      }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value: "",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      fillEmptyTemporalWithNow: true,
    })

    expect(mocks.updateSet).toHaveBeenCalledTimes(1)
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value).toEqual(expect.any(String))
    expect(setArg.value.length).toBeGreaterThan(0)
    expect(setArg.value).toMatch(NOW_STAMPED_DATE_PATTERN)
    expect(result.value).toBe(setArg.value)
  })

  test("a blank value WITHOUT fillEmptyTemporalWithNow stores the empty string unchanged instead of stamping now", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "date" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "date", value: "" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.set,
      value: "",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
    })

    // Contrast with the `fillEmptyTemporalWithNow: true` test above — proves
    // that flag, not something else, is what decides between "now" and the
    // pre-existing blank-passthrough behavior.
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "" })
    expect(result.value).toBe("")
  })
})

describe("botFieldService.applyValueOperation — append/prepend/increase/decrease", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    "shortText",
    "longText",
  ] as const)("append is allowed for %s and runs as one atomic UPDATE", async (type) => {
    mocks.findFirst.mockResolvedValue(existingRow({ type, value: "foo" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type, value: "foobar" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.append,
      value: "bar",
    })

    expect(result.value).toBe("foobar")
    // Single read (type/id lookup) + single atomic write — no
    // read-modify-write of the value itself.
    expect(mocks.findFirst).toHaveBeenCalledTimes(1)
    expect(mocks.updateReturning).toHaveBeenCalledTimes(1)
    // The written value is the SQL expression object, not a JS-computed
    // literal, proving the concatenation happens inside Postgres.
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.text).toContain("concat")
    expect(setArg.value.values).toContain("bar")
  })

  test("prepend concatenates on the left via a single atomic UPDATE", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "longText", value: "bar" }),
    )
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "longText", value: "foobar" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.prepend,
      value: "foo",
    })

    expect(result.value).toBe("foobar")
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.text).toContain("concat")
  })

  test("increase runs a single atomic numeric UPDATE for type number", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "15" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.increase,
      value: "5",
    })

    expect(result.value).toBe("15")
    expect(mocks.findFirst).toHaveBeenCalledTimes(1)
    expect(mocks.updateReturning).toHaveBeenCalledTimes(1)
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.text).toContain("numeric")
    expect(setArg.value.text).toContain("+")
  })

  test("decrease runs a single atomic numeric UPDATE for type number", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "5" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.decrease,
      value: "5",
    })

    expect(result.value).toBe("5")
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.text).toContain("numeric")
    expect(setArg.value.text).toContain("-")
  })

  test("a historical non-numeric value under increase fails predictably instead of a raw DB error", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "not-a-number" }),
    )
    mocks.updateReturning.mockRejectedValue(
      new Error('invalid input syntax for type numeric: "not-a-number"'),
    )

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.increase,
        value: "5",
      }),
    ).rejects.toMatchObject({
      code: "invalidFieldOperation",
    })
  })

  test("a historical non-numeric value under decrease fails predictably instead of a raw DB error", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "not-a-number" }),
    )
    mocks.updateReturning.mockRejectedValue(
      new Error('invalid input syntax for type numeric: "not-a-number"'),
    )

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.decrease,
        value: "5",
      }),
    ).rejects.toMatchObject({
      code: "invalidFieldOperation",
    })
  })

  test("an unrelated DB failure under append is not mislabeled as a numeric error", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "shortText", value: "foo" }),
    )
    const dbError = new Error("connection reset")
    mocks.updateReturning.mockRejectedValue(dbError)

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.append,
        value: "bar",
      }),
    ).rejects.toBe(dbError)
  })

  test("throws notFound when the atomic UPDATE affects no row (id vanished mid-flight)", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.increase,
        value: "5",
      }),
    ).rejects.toThrow("Bot field not found")
  })
})

describe("botFieldService.applyValueOperation — operation x type policy", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const textOnlyOperations = [
    FieldOperationType.append,
    FieldOperationType.prepend,
  ]
  const numberOnlyOperations = [
    FieldOperationType.increase,
    FieldOperationType.decrease,
  ]
  const nonTextTypes = [
    "number",
    "boolean",
    "date",
    "datetime",
    "email",
    "phoneNumber",
  ] as const
  const nonNumberTypes = [
    "shortText",
    "longText",
    "boolean",
    "date",
    "datetime",
    "email",
    "phoneNumber",
  ] as const

  test.each(
    textOnlyOperations.flatMap((operation) =>
      nonTextTypes.map((type) => [operation, type] as const),
    ),
  )("%s is rejected for type %s", async (operation, type) => {
    mocks.findFirst.mockResolvedValue(existingRow({ type }))

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation,
        value: "x",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test.each(
    numberOnlyOperations.flatMap((operation) =>
      nonNumberTypes.map((type) => [operation, type] as const),
    ),
  )("%s is rejected for type %s", async (operation, type) => {
    mocks.findFirst.mockResolvedValue(existingRow({ type }))

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation,
        value: "x",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("set is allowed for every type, including boolean/date/datetime which reject every other operation", async () => {
    const valuesByType = {
      boolean: "true",
      date: "2026-07-22",
      datetime: "2026-07-22 15:30",
    } as const

    for (const type of ["boolean", "date", "datetime"] as const) {
      vi.clearAllMocks()
      mocks.findFirst.mockResolvedValue(existingRow({ type, value: "old" }))
      mocks.updateReturning.mockResolvedValue([
        existingRow({ type, value: "old" }),
      ])

      await expect(
        botFieldService.applyValueOperation({
          workspaceId: "ws-1",
          key: "field",
          operation: FieldOperationType.set,
          value: valuesByType[type],
          sourceTimezoneOverride:
            type === "boolean" ? undefined : "Asia/Ho_Chi_Minh",
        }),
      ).resolves.toBeDefined()
    }
  })

  test("thrown exceptions are ChatbotXException instances", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "boolean" }))

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.increase,
        value: "1",
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)
  })
})

describe("botFieldService.clearValueByKey", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("nulls the value without deleting the row", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ value: "keep-the-row" }))
    mocks.updateReturning.mockResolvedValue([existingRow({ value: null })])

    const result = await botFieldService.clearValueByKey({
      workspaceId: "ws-1",
      key: "field",
    })

    expect(result.value).toBeNull()
    expect(result.id).toBe("1")
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: null })
    expect(mocks.invalidateCacheTags).toHaveBeenCalledWith(
      expect.arrayContaining(["bot-fields:ws-1:1"]),
    )
  })

  // Regression coverage for Finding 2: a row deleted between
  // `findByKeyOrFail` and the UPDATE (concurrent delete) must surface as
  // notFound, never as a silent "success" with an undefined row.
  test("throws notFound when the row is deleted concurrently between the lookup and the UPDATE", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ value: "keep-the-row" }))
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      botFieldService.clearValueByKey({
        workspaceId: "ws-1",
        key: "field",
      }),
    ).rejects.toThrow("Bot field not found")

    expect(mocks.invalidateCacheTags).not.toHaveBeenCalled()
  })
})

describe("botFieldService.resolveByNameAndType", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // Regression: whole-workspace caches (the variables package's bot-field
  // map) cache the ABSENCE of a field, so creating missing fields during a
  // template/flow import must invalidate the workspace tags — otherwise the
  // imported flow's {{bot_field:<newId>}} tokens stay unresolved until TTL.
  test("invalidates workspace cache tags when it creates missing fields", async () => {
    mocks.findMany.mockResolvedValue([])
    mocks.insertReturning.mockResolvedValue([
      existingRow({ id: "9", name: "new field", type: "shortText" }),
    ])

    await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [{ name: "new field", type: "shortText" }],
    })

    expect(mocks.invalidateCacheTags).toHaveBeenCalledWith(
      expect.arrayContaining(["bot-fields:ws-1", "bot-fields:ws-1:9"]),
    )
  })

  test("does not invalidate when every field already exists", async () => {
    mocks.findMany.mockResolvedValue([
      existingRow({ id: "1", name: "field", type: "shortText" }),
    ])

    await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [{ name: "field", type: "shortText" }],
    })

    expect(mocks.invalidateCacheTags).not.toHaveBeenCalled()
  })
})

describe("botFieldService.bulkClearValues", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("nulls the values of the selected rows and invalidates their tags", async () => {
    await botFieldService.bulkClearValues({
      workspaceId: "ws-1",
      ids: ["1", "2"],
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ value: null })
    expect(mocks.invalidateCacheTags).toHaveBeenCalledWith(
      expect.arrayContaining(["bot-fields:ws-1:1", "bot-fields:ws-1:2"]),
    )
  })

  test("is a no-op for an empty id list", async () => {
    await botFieldService.bulkClearValues({ workspaceId: "ws-1", ids: [] })

    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheTags).not.toHaveBeenCalled()
  })
})

// `create`/`updateByKey` gained `prepareValuePatch` this phase — the builder
// dialogs, template install, and workspace-token set-one/set-many/bulk-update
// APIs all funnel through these two methods, so normalizing here covers all
// of them without touching those call sites individually.
describe("botFieldService.create — value normalization", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("coerces a boolean value before insert", async () => {
    mocks.insertReturning.mockResolvedValue([
      existingRow({ type: "boolean", value: "true" }),
    ])

    await botFieldService.create({
      workspaceId: "ws-1",
      data: { name: "field", type: "boolean", value: "yes" },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "true" }),
    )
  })

  test("canonicalizes a number value before insert", async () => {
    mocks.insertReturning.mockResolvedValue([
      existingRow({ type: "number", value: "7" }),
    ])

    await botFieldService.create({
      workspaceId: "ws-1",
      data: { name: "field", type: "number", value: "007" },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "7" }),
    )
  })

  test("rejects an unparseable number value instead of inserting garbage", async () => {
    await expect(
      botFieldService.create({
        workspaceId: "ws-1",
        data: { name: "field", type: "number", value: "1aaa1" },
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)

    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("normalizes a date value against the workspace timezone", async () => {
    mocks.workspaceFindFirst.mockResolvedValue({
      timezone: "Asia/Ho_Chi_Minh",
    })
    mocks.insertReturning.mockResolvedValue([
      existingRow({ type: "date", value: "2026-07-22T00:00:00+07:00" }),
    ])

    await botFieldService.create({
      workspaceId: "ws-1",
      data: { name: "field", type: "date", value: "2026-07-22" },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "2026-07-22T00:00:00+07:00" }),
    )
  })

  test("leaves a null value alone (no normalization attempted)", async () => {
    mocks.insertReturning.mockResolvedValue([
      existingRow({ type: "boolean", value: null }),
    ])

    await botFieldService.create({
      workspaceId: "ws-1",
      data: { name: "field", type: "boolean", value: null },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: null }),
    )
    expect(mocks.workspaceFindFirst).not.toHaveBeenCalled()
  })
})

describe("botFieldService.updateByKey — value normalization", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("coerces a boolean value using the existing row's type when the patch omits type", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "boolean" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "boolean", value: "true" }),
    ])

    const result = await botFieldService.updateByKey({
      workspaceId: "ws-1",
      key: "field",
      data: { value: "on" },
    })

    expect(result.value).toBe("true")
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "true" })
  })

  test("normalizes against the NEW type when the patch changes type and value together", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "shortText" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "5" }),
    ])

    await botFieldService.updateByKey({
      workspaceId: "ws-1",
      key: "field",
      data: { type: "number", value: "5" },
    })

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ type: "number", value: "5" }),
    )
  })

  test("rejects an unparseable number value instead of persisting garbage", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "number" }))

    await expect(
      botFieldService.updateByKey({
        workspaceId: "ws-1",
        key: "field",
        data: { value: "1aaa1" },
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("leaves an undefined value alone (a patch that doesn't touch value)", async () => {
    mocks.findFirst.mockResolvedValue(existingRow({ type: "number" }))
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", description: "new desc" }),
    ])

    await botFieldService.updateByKey({
      workspaceId: "ws-1",
      key: "field",
      data: { description: "new desc" },
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ description: "new desc" })
    expect(mocks.workspaceFindFirst).not.toHaveBeenCalled()
  })
})

describe("botFieldService.bulkUpdateByKeys — delegates to updateByKey (inherits normalization)", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("coerces each update's value via the same primitive as updateByKey", async () => {
    // Keyed by the lookup `where` clause (not call order): `updateByKey` runs
    // both keys concurrently via `Promise.all`, so resolution order across the
    // two isn't guaranteed — only that each key's own type governs its own
    // coercion.
    mocks.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === "1"
          ? existingRow({ id: "1", type: "boolean" })
          : existingRow({ id: "2", type: "number" }),
      ),
    )
    mocks.updateReturning.mockResolvedValue([existingRow()])

    await botFieldService.bulkUpdateByKeys({
      workspaceId: "ws-1",
      updates: [
        { key: "1", value: "yes" },
        { key: "2", value: "007" },
      ],
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "true" })
    expect(mocks.updateSet).toHaveBeenCalledWith({ value: "7" })
  })
})

describe("botFieldService.applyValueOperation — increase/decrease operand validation", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("rejects a non-numeric operand with a typed error BEFORE touching the DB", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.increase,
        value: "not-a-number",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.updateReturning).not.toHaveBeenCalled()
  })

  test("canonicalizes the operand before it reaches the atomic SQL", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "17" }),
    ])

    await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.increase,
      // "007" canonicalizes to "7" before being bound into the SQL.
      value: "007",
    })

    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.values).toContain("7")
    expect(setArg.value.values).not.toContain("007")
  })

  // Regression coverage for Finding 2: the operand path used to call the
  // un-trimmed `normalizeNumber` while `set` trimmed — a whitespace-padded
  // operand would throw here even though the equivalent `set` value would
  // succeed. Switching to `canonicalNumberLiteral` (which trims) fixes the
  // inconsistency.
  test("trims a whitespace-padded operand and adds the canonical value", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "11.5" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.increase,
      value: " 1.5 ",
    })

    expect(result.value).toBe("11.5")
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.values).toContain("1.5")
    expect(setArg.value.values).not.toContain(" 1.5 ")
  })

  test('accepts a "+" prefixed operand (widened Number() vocabulary)', async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )
    mocks.updateReturning.mockResolvedValue([
      existingRow({ type: "number", value: "12" }),
    ])

    const result = await botFieldService.applyValueOperation({
      workspaceId: "ws-1",
      key: "field",
      operation: FieldOperationType.increase,
      value: "+2",
    })

    expect(result.value).toBe("12")
    const [[setArg]] = mocks.updateSet.mock.calls
    expect(setArg.value.values).toContain("2")
  })

  test("still rejects an unparseable operand with a typed error", async () => {
    mocks.findFirst.mockResolvedValue(
      existingRow({ type: "number", value: "10" }),
    )

    await expect(
      botFieldService.applyValueOperation({
        workspaceId: "ws-1",
        key: "field",
        operation: FieldOperationType.decrease,
        value: "1aaa1",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
  })
})
