// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// applyFieldOperations locks every (contact, field) pair, reads the current
// values in one query, calculates each result and writes it inside one
// transaction. The customFieldChanged events MUST fire only after the
// transaction commits — the trigger worker re-reads the value, so a
// mid-transaction emit can read uncommitted or rolled-back data.

const callLog: string[] = []

const mocks = vi.hoisted(() => ({
  findManyByIds: vi.fn(),
  customFieldFindManyByIds: vi.fn(),
  lockPairs: vi.fn(),
  listValuesForPairs: vi.fn(),
  deleteValue: vi.fn(),
  insertValues: vi.fn(),
  insertOnConflictDoUpdate: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  emitCustomFieldChanged: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

const txHandle = {
  __tx: true,
  query: {
    customFieldModel: {
      findMany: vi.fn(async () => [{ id: "cf-1", name: "plan", type: "text" }]),
    },
    contactCustomFieldModel: {
      findMany: vi.fn(async () => []),
    },
  },
  insert: () => ({
    values: (values: unknown) => {
      mocks.insertValues(values)
      return {
        onConflictDoUpdate: (args: unknown) => {
          mocks.insertOnConflictDoUpdate(args)
          return Promise.resolve()
        },
      }
    },
  }),
  update: () => ({
    set: (values: unknown) => {
      mocks.updateSet(values)
      return { where: (cond: unknown) => mocks.updateWhere(cond) }
    },
  }),
}

vi.mock("../src/contact/service", () => ({
  contactService: { findManyByIds: mocks.findManyByIds },
}))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByIds: mocks.customFieldFindManyByIds },
}))

vi.mock("../src/bot-field/service", () => ({
  botFieldService: {},
}))

vi.mock("../src/contact-custom-field/value-service", () => ({
  contactCustomFieldValueService: {},
}))

vi.mock("../src/contact-custom-field/normalize.ts", async () => {
  const { canonicalNumberLiteral } = await import(
    "@chatbotx.io/utils/custom-field"
  )
  return {
    normalizeCustomFieldValueForStorage: async ({
      type,
      value,
    }: {
      type: string
      value: string
    }) =>
      // Mirrors the real number coercion so a normalized value feeds the next op.
      type === "number" ? (canonicalNumberLiteral(value) ?? value) : value,
    createSourceTimezoneResolver: () => vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  db: {
    transaction: async (cb: (tx: unknown) => unknown) => {
      const result = await cb(txHandle)
      callLog.push("commit")
      return result
    },
  },
}))

// This suite never exercises `listWithDefinitionByContact`/`findWithDefinition`,
// but vitest's SSR deps optimizer bundles the whole `@chatbotx.io/database`
// package graph together once any subpath is imported, which otherwise pulls
// in `contactCustomFieldRepository`'s real contact-filter query graph (needs
// the real schema, conflicting with the narrow mock below).
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactCustomFieldRepository: {
    lockPairs: (...args: unknown[]) => {
      callLog.push("lock")
      return mocks.lockPairs(...args)
    },
    listValuesForPairs: (...args: unknown[]) =>
      mocks.listValuesForPairs(...args),
    deleteValue: (...args: unknown[]) => {
      callLog.push("write")
      return mocks.deleteValue(...args)
    },
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {
    value: "value",
    contactId: "contactId",
    customFieldId: "customFieldId",
    id: "id",
  },
  customFieldModel: {},
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: (...args: unknown[]) => {
    callLog.push("emit")
    return mocks.emitCustomFieldChanged(...args)
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) =>
    mocks.invalidateCacheByTags(...args),
}))

vi.mock("@chatbotx.io/flow-config", async () => ({
  FieldOperationType: (
    await import("@chatbotx.io/utils/custom-field-operation")
  ).FieldOperationType,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("../src/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/errors")>()),
  notFoundException: (message: string) => new Error(message),
}))

const mockLoggerWarn = vi.hoisted(() => vi.fn())

vi.mock("../src/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)

// Intercept the writes/updates that record the "write" step in callLog,
// wrapping insertValues/updateSet so ordering relative to commit is visible.
mocks.insertValues.mockImplementation(() => {
  callLog.push("write")
})
mocks.updateSet.mockImplementation(() => {
  callLog.push("write")
})

const { FieldOperationType } = await import(
  "@chatbotx.io/utils/custom-field-operation"
)

const field = (type: string) => ({ id: "cf-1", name: "plan", type })

const writtenValues = () =>
  mocks.insertValues.mock.calls.map(([values]) => values.value)

const arrange = (input: {
  type?: string
  stored?: Array<{ contactId: string; customFieldId: string; value: string }>
  contactIds?: string[]
}) => {
  mocks.findManyByIds.mockResolvedValue(
    (input.contactIds ?? ["contact-1"]).map((id) => ({ id })),
  )
  mocks.customFieldFindManyByIds.mockResolvedValue([
    field(input.type ?? "shortText"),
  ])
  mocks.listValuesForPairs.mockResolvedValue(input.stored ?? [])
}

describe("contactCustomFieldService.applyFieldOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callLog.length = 0
    mocks.emitCustomFieldChanged.mockResolvedValue(undefined)
    mocks.insertValues.mockImplementation(() => {
      callLog.push("write")
    })
    mocks.updateSet.mockImplementation(() => {
      callLog.push("write")
    })
    mocks.insertOnConflictDoUpdate.mockResolvedValue(undefined)
    mocks.lockPairs.mockResolvedValue(undefined)
    mocks.deleteValue.mockResolvedValue(null)
    txHandle.query.customFieldModel.findMany = vi.fn(async () => [
      field("shortText"),
    ])
    txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () => [])
    arrange({})
  })

  test("locks the pairs, writes inside the transaction and emits only after commit", async () => {
    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.set,
      value: "pro",
    })

    expect(callLog.indexOf("lock")).toBeLessThan(callLog.indexOf("write"))
    expect(callLog.indexOf("write")).toBeLessThan(callLog.indexOf("commit"))
    expect(callLog.indexOf("emit")).toBeGreaterThan(callLog.indexOf("commit"))
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "cf-1",
      "plan",
      null,
      "pro",
      undefined,
      undefined,
    )
  })

  test("reads every current value in one query and takes one lock set", async () => {
    arrange({ contactIds: ["contact-1", "contact-2"] })

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
      customFieldId: "cf-1",
      operation: FieldOperationType.append,
      value: "x",
    })

    expect(mocks.lockPairs).toHaveBeenCalledTimes(1)
    expect(mocks.listValuesForPairs).toHaveBeenCalledTimes(1)
    expect(mocks.listValuesForPairs).toHaveBeenCalledWith(
      {
        contactIds: ["contact-1", "contact-2"],
        customFieldIds: ["cf-1"],
      },
      txHandle,
    )
  })

  test("emits nothing when the value does not change", async () => {
    txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () => [
      { customFieldId: "cf-1", value: "pro" },
    ])

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.set,
      value: "pro",
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("append, increase and decrease are computed from the stored value", async () => {
    arrange({
      type: "number",
      stored: [{ contactId: "contact-1", customFieldId: "cf-1", value: "10" }],
    })
    txHandle.query.customFieldModel.findMany = vi.fn(async () => [
      field("number"),
    ])

    await contactCustomFieldService.applyOperations({
      workspaceId: "ws-1",
      contactId: "contact-1",
      operations: [
        {
          customFieldId: "cf-1",
          operation: FieldOperationType.increase,
          value: "5",
        },
        {
          customFieldId: "cf-1",
          operation: FieldOperationType.decrease,
          value: "3",
        },
      ],
    })

    // The second operation sees the first one's result.
    expect(writtenValues()).toEqual(["15", "12"])
  })

  test("decrease on a missing value yields the negative operand", async () => {
    arrange({ type: "number" })
    txHandle.query.customFieldModel.findMany = vi.fn(async () => [
      field("number"),
    ])

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.decrease,
      value: "5",
    })

    expect(writtenValues()).toEqual(["-5"])
  })

  test("clear deletes the value and emits one post-commit event", async () => {
    mocks.deleteValue.mockResolvedValue("old")

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.clear,
      value: "",
    })

    expect(mocks.deleteValue).toHaveBeenCalledWith(
      { contactId: "contact-1", customFieldId: "cf-1" },
      txHandle,
    )
    expect(callLog.indexOf("emit")).toBeGreaterThan(callLog.indexOf("commit"))
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(1)
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "cf-1",
      "plan",
      "old",
      null,
      undefined,
      undefined,
    )
  })

  test("clearing a value that does not exist emits nothing", async () => {
    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.clear,
      value: "",
    })

    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("a rejected operation on one contact throws a structured error and emits nothing", async () => {
    arrange({ type: "number" })

    await expect(
      contactCustomFieldService.applyOperationToContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1"],
        customFieldId: "cf-1",
        operation: FieldOperationType.increase,
        value: "abc",
      }),
    ).rejects.toMatchObject({
      code: "invalidFieldOperation",
      data: { reason: "operandNotNumber" },
    })
    expect(callLog).not.toContain("commit")
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("an operation the field type does not allow is rejected", async () => {
    await expect(
      contactCustomFieldService.applyOperationToContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1"],
        customFieldId: "cf-1",
        operation: FieldOperationType.formula,
        value: "value + 1",
      }),
    ).rejects.toMatchObject({ data: { reason: "operationNotAllowed" } })
  })

  test("a bulk edit skips the contacts a rejection hits and applies the rest", async () => {
    arrange({
      type: "number",
      contactIds: ["contact-1", "contact-2"],
      stored: [
        { contactId: "contact-1", customFieldId: "cf-1", value: "1" },
        {
          contactId: "contact-2",
          customFieldId: "cf-1",
          value: "not a number",
        },
      ],
    })
    txHandle.query.customFieldModel.findMany = vi.fn(async () => [
      field("number"),
    ])

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
      customFieldId: "cf-1",
      operation: FieldOperationType.increase,
      value: "2",
    })

    expect(writtenValues()).toEqual(["3"])
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(1)
  })

  test("contacts outside the caller's access scope are dropped", async () => {
    arrange({ contactIds: ["contact-1"] })

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
      customFieldId: "cf-1",
      operation: FieldOperationType.set,
      value: "pro",
    })

    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(1)
    expect(mocks.emitCustomFieldChanged.mock.calls[0]?.[1]).toBe("contact-1")
  })

  test("runs a whole batch in one transaction, all writes before the single commit", async () => {
    await contactCustomFieldService.applyOperations({
      workspaceId: "ws-1",
      contactId: "contact-1",
      operations: [
        {
          customFieldId: "cf-1",
          operation: FieldOperationType.set,
          value: "a",
        },
        {
          customFieldId: "cf-1",
          operation: FieldOperationType.append,
          value: "b",
        },
        {
          customFieldId: "cf-1",
          operation: FieldOperationType.prepend,
          value: "c",
        },
      ],
    })

    expect(callLog.filter((entry) => entry === "commit")).toHaveLength(1)
    const commitIndex = callLog.indexOf("commit")
    const writeIndices = callLog.flatMap((entry, index) =>
      entry === "write" ? [index] : [],
    )
    expect(writeIndices).toHaveLength(3)
    for (const writeIndex of writeIndices) {
      expect(writeIndex).toBeLessThan(commitIndex)
    }
    expect(writtenValues()).toEqual(["a", "ab", "cab"])
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(3)
  })

  test("an unknown custom field fails before anything is locked, written or emitted", async () => {
    await expect(
      contactCustomFieldService.applyOperations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        operations: [
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.set,
            value: "a",
          },
          {
            customFieldId: "cf-bad",
            operation: FieldOperationType.set,
            value: "b",
          },
        ],
      }),
    ).rejects.toThrow("Custom field not found")

    expect(mocks.lockPairs).not.toHaveBeenCalled()
    expect(callLog).not.toContain("commit")
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("a failure after an earlier write rolls everything back without events", async () => {
    mocks.deleteValue.mockRejectedValue(new Error("db down"))

    await expect(
      contactCustomFieldService.applyOperations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        operations: [
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.set,
            value: "a",
          },
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.clear,
            value: "",
          },
        ],
      }),
    ).rejects.toThrow("db down")

    expect(callLog).not.toContain("commit")
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("with one of two requested contacts out of scope the call is strict and rejects", async () => {
    arrange({
      type: "number",
      contactIds: ["contact-1"],
      stored: [{ contactId: "contact-1", customFieldId: "cf-1", value: "abc" }],
    })
    txHandle.query.customFieldModel.findMany = vi.fn(async () => [
      field("number"),
    ])

    await expect(
      contactCustomFieldService.applyOperationToContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1", "contact-2"],
        customFieldId: "cf-1",
        operation: FieldOperationType.increase,
        value: "2",
      }),
    ).rejects.toMatchObject({ code: "invalidFieldOperation" })

    expect(callLog).not.toContain("commit")
    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("with both contacts accessible the invalid one is skipped and logged", async () => {
    arrange({
      type: "number",
      contactIds: ["contact-1", "contact-2"],
      stored: [
        { contactId: "contact-1", customFieldId: "cf-1", value: "abc" },
        { contactId: "contact-2", customFieldId: "cf-1", value: "1" },
      ],
    })
    txHandle.query.customFieldModel.findMany = vi.fn(async () => [
      field("number"),
    ])

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
      customFieldId: "cf-1",
      operation: FieldOperationType.increase,
      value: "2",
    })

    expect(writtenValues()).toEqual(["3"])
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(1)
    expect(mocks.emitCustomFieldChanged.mock.calls[0]?.[1]).toBe("contact-2")
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  describe("sequential normalization in one batch", () => {
    const store = new Map<string, string>()
    const numberField = (id: string) => ({ id, name: id, type: "number" })

    const arrangeStore = (fieldIds: string[]) => {
      store.clear()
      mocks.findManyByIds.mockResolvedValue([{ id: "contact-1" }])
      mocks.customFieldFindManyByIds.mockResolvedValue(
        fieldIds.map(numberField),
      )
      mocks.listValuesForPairs.mockImplementation(async () =>
        [...store].map(([customFieldId, value]) => ({
          contactId: "contact-1",
          customFieldId,
          value,
        })),
      )
      txHandle.query.customFieldModel.findMany = vi.fn(async () =>
        fieldIds.map(numberField),
      )
      txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () =>
        [...store].map(([customFieldId, value]) => ({
          id: `row-${customFieldId}`,
          customFieldId,
          value,
        })),
      )
      mocks.insertValues.mockImplementation((values) => {
        store.set(values.customFieldId, values.value)
      })
      let pendingValue = ""
      mocks.updateSet.mockImplementation((values) => {
        pendingValue = values.value
      })
      mocks.updateWhere.mockImplementation((cond: string[]) => {
        store.set(String(cond[1]).replace("row-", ""), pendingValue)
      })
      mocks.deleteValue.mockImplementation(({ customFieldId }) => {
        const old = store.get(customFieldId) ?? null
        store.delete(customFieldId)
        return Promise.resolve(old)
      })
    }

    const emittedChanges = () =>
      mocks.emitCustomFieldChanged.mock.calls.map(
        ([, , customFieldId, , oldValue, newValue]) => [
          customFieldId,
          oldValue,
          newValue,
        ],
      )

    test("set, increase and formula feed each normalized value into the next", async () => {
      arrangeStore(["cf-1"])

      await contactCustomFieldService.applyOperations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        operations: [
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.set,
            value: "007",
          },
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.increase,
            value: "2",
          },
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.formula,
            value: "value*2",
          },
        ],
      })

      expect(store.get("cf-1")).toBe("18")
      expect(emittedChanges()).toEqual([
        ["cf-1", null, "7"],
        ["cf-1", "7", "9"],
        ["cf-1", "9", "18"],
      ])
    })

    test("an increase after a clear starts from zero", async () => {
      arrangeStore(["cf-1"])
      store.set("cf-1", "50")

      await contactCustomFieldService.applyOperations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        operations: [
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.clear,
            value: "",
          },
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.increase,
            value: "4",
          },
        ],
      })

      expect(store.get("cf-1")).toBe("4")
      expect(emittedChanges()).toEqual([
        ["cf-1", "50", null],
        ["cf-1", null, "4"],
      ])
    })

    test("operations on two fields keep independent values", async () => {
      arrangeStore(["cf-1", "cf-2"])
      store.set("cf-1", "10")
      store.set("cf-2", "100")

      await contactCustomFieldService.applyOperations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        operations: [
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.increase,
            value: "1",
          },
          {
            customFieldId: "cf-2",
            operation: FieldOperationType.decrease,
            value: "1",
          },
          {
            customFieldId: "cf-1",
            operation: FieldOperationType.increase,
            value: "1",
          },
        ],
      })

      expect(store.get("cf-1")).toBe("12")
      expect(store.get("cf-2")).toBe("99")
    })
  })

  test("appending a padded operand stores it verbatim, without trimming", async () => {
    arrange({
      stored: [{ contactId: "contact-1", customFieldId: "cf-1", value: "a" }],
    })

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.append,
      value: " x ",
    })

    expect(writtenValues()).toEqual(["a x "])
  })

  test("appending a whitespace-only operand writes it; only an empty operand is unchanged", async () => {
    const stored = [
      { contactId: "contact-1", customFieldId: "cf-1", value: "a" },
    ]
    arrange({ stored })

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.append,
      value: "   ",
    })
    expect(writtenValues()).toEqual(["a   "])

    vi.clearAllMocks()
    arrange({ stored })
    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: FieldOperationType.append,
      value: "",
    })
    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })
})
