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

vi.mock("@chatbotx.io/business/errors", () => ({}))

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
})
