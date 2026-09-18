// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// applyOperationToContacts locks each contact row FOR UPDATE, computes the
// new value, and writes it inside one transaction. The customFieldChanged
// events MUST fire only after the transaction commits — the trigger worker
// re-reads the value, so a mid-transaction emit can read uncommitted or
// rolled-back data.

const callLog: string[] = []

const mocks = vi.hoisted(() => ({
  findManyByIds: vi.fn(),
  customFieldFindManyByIds: vi.fn(),
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
  insertOnConflictDoUpdate: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  emitCustomFieldChanged: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

const txHandle = {
  __tx: true,
  select: () => ({
    from: () => ({
      where: () => ({
        for: () => ({ limit: mocks.selectLimit }),
      }),
    }),
  }),
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

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

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

vi.mock("../src/contact-custom-field/normalize.ts", () => ({
  normalizeCustomFieldValueForStorage: async ({ value }: { value: unknown }) =>
    value,
  createSourceTimezoneResolver: () => vi.fn(),
}))

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
vi.mock("@chatbotx.io/database/repositories", () => ({}))

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

vi.mock("@chatbotx.io/flow-config", () => ({
  FieldOperationType: {
    append: "append",
    prepend: "prepend",
    increase: "increase",
    decrease: "decrease",
    set: "set",
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
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

describe("contactCustomFieldService.applyOperationToContacts — event ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callLog.length = 0
    mocks.findManyByIds.mockResolvedValue([{ id: "contact-1" }])
    mocks.customFieldFindManyByIds.mockResolvedValue([
      { id: "cf-1", name: "plan" },
    ])
    mocks.emitCustomFieldChanged.mockResolvedValue(undefined)
    mocks.insertValues.mockClear()
    mocks.insertValues.mockImplementation(() => {
      callLog.push("write")
    })
    mocks.updateSet.mockClear()
    mocks.updateSet.mockImplementation(() => {
      callLog.push("write")
    })
    mocks.insertOnConflictDoUpdate.mockResolvedValue(undefined)
    // No existing value for the field on this contact -> insert path.
    mocks.selectLimit.mockResolvedValue([])
    txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () => [])
  })

  test("writes inside the transaction and emits per contact only after commit", async () => {
    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "set" as never,
      value: "pro",
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })

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
    )
  })

  test("emits nothing when no contact value actually changes", async () => {
    // Existing value equals the incoming value -> diff guard skips the write.
    txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () => [
      { customFieldId: "cf-1", value: "pro" },
    ])

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "set" as never,
      value: "pro",
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  // `contacts.setCustomFields` (deleted by the public-API consolidation;
  // `contacts.applyCustomFieldOperations` is the surviving batch route)
  // called `setValues`, whose `writeValues` step runs every value through
  // `normalizeCustomFieldValueForStorage` (type coercion, temporal
  // parsing/timezone resolution) before persisting.
  // `applyOperationToContacts`/`applyOperations` predate this PR and never
  // called that normalizer — they persist `computeUpdatedFieldValue`'s raw
  // string as-is. This is not a regression introduced by the consolidation
  // (the gap pre-existed on `main`), but it is a real behavioral difference
  // between the two batch-write paths worth pinning: a caller migrating
  // from `setCustomFields` to `applyCustomFieldOperations` for a
  // date/datetime-typed field loses `setValues`'s temporal normalization.
  test("persists the raw computed value without type/temporal normalization", async () => {
    txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () => [])

    await contactCustomFieldService.applyOperationToContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
      operation: "set" as never,
      value: "not-a-normalized-date",
      sourceTimezone: "Asia/Ho_Chi_Minh",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "not-a-normalized-date" }),
    )
  })
})

describe("contactCustomFieldService.applyOperations — batch atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callLog.length = 0
    mocks.findManyByIds.mockResolvedValue([{ id: "contact-1" }])
    mocks.customFieldFindManyByIds.mockResolvedValue([
      { id: "cf-1", name: "plan" },
    ])
    mocks.emitCustomFieldChanged.mockResolvedValue(undefined)
    mocks.insertValues.mockClear()
    mocks.insertValues.mockImplementation(() => {
      callLog.push("write")
    })
    mocks.updateSet.mockClear()
    mocks.updateSet.mockImplementation(() => {
      callLog.push("write")
    })
    mocks.insertOnConflictDoUpdate.mockResolvedValue(undefined)
    mocks.selectLimit.mockResolvedValue([])
    txHandle.query.contactCustomFieldModel.findMany = vi.fn(async () => [])
  })

  test("runs every operation inside one outer transaction, all writes before commit", async () => {
    await contactCustomFieldService.applyOperations({
      workspaceId: "ws-1",
      contactId: "contact-1",
      operations: [
        { customFieldId: "cf-1", operation: "set" as never, value: "a" },
        { customFieldId: "cf-1", operation: "append" as never, value: "b" },
        { customFieldId: "cf-1", operation: "prepend" as never, value: "c" },
      ],
    })

    // Exactly one commit for the whole batch (not one per operation), and
    // every write happens before that single commit.
    expect(callLog.filter((entry) => entry === "commit")).toHaveLength(1)
    const commitIndex = callLog.indexOf("commit")
    const writeIndices = callLog.reduce<number[]>((acc, entry, index) => {
      if (entry === "write") {
        acc.push(index)
      }
      return acc
    }, [])
    expect(writeIndices).toHaveLength(3)
    for (const writeIndex of writeIndices) {
      expect(writeIndex).toBeLessThan(commitIndex)
    }
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(3)
  })

  test("rolls back every earlier operation when a later one fails", async () => {
    // First call (operation 1) resolves the field; second call (operation 2)
    // simulates an unknown custom field, the same way the real repository
    // returns no rows for a nonexistent id.
    mocks.customFieldFindManyByIds
      .mockResolvedValueOnce([{ id: "cf-1", name: "plan" }])
      .mockResolvedValueOnce([])

    await expect(
      contactCustomFieldService.applyOperations({
        workspaceId: "ws-1",
        contactId: "contact-1",
        operations: [
          { customFieldId: "cf-1", operation: "set" as never, value: "a" },
          { customFieldId: "cf-bad", operation: "set" as never, value: "b" },
        ],
      }),
    ).rejects.toThrow("Custom field not found")

    // The whole batch is one transaction: a failure on the second operation
    // must mean nothing committed and nothing was emitted, even though the
    // first operation's write already ran against the (rolled-back) tx.
    expect(callLog).not.toContain("commit")
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })
})
