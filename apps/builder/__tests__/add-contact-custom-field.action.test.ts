import { beforeEach, describe, expect, test, vi } from "vitest"

// addContactCustomFields locks each contact row FOR UPDATE, computes the new
// value, and writes it inside one transaction. The customFieldChanged events
// MUST fire only after the transaction commits — the trigger worker re-reads the
// value, so a mid-transaction emit can read uncommitted or rolled-back data.

const callLog: string[] = []

const mocks = vi.hoisted(() => ({
  findManyByIds: vi.fn(),
  findOrFail: vi.fn(),
  setValuesInTransaction: vi.fn(),
  emitCustomFieldChanges: vi.fn(),
  selectLimit: vi.fn(),
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
}

vi.mock("@chatbotx.io/business", () => ({
  contactService: { findManyByIds: mocks.findManyByIds },
  contactCustomFieldService: {
    setValuesInTransaction: (...args: unknown[]) => {
      callLog.push("write")
      return mocks.setValuesInTransaction(...args)
    },
    emitCustomFieldChanges: (...args: unknown[]) => {
      callLog.push("emit")
      return mocks.emitCustomFieldChanges(...args)
    },
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  findOrFail: mocks.findOrFail,
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
  },
  customFieldModel: {},
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  FieldOperationType: {
    append: "append",
    prepend: "prepend",
    increase: "increase",
    decrease: "decrease",
  },
}))

vi.mock("@/features/common/schemas", () => ({
  workspaceIdrequestParams: {},
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/contacts/permissions", () => ({
  requireContactPermissionScope: vi.fn(),
}))

vi.mock("../src/features/contacts/schemas/contact-custom-field", () => ({
  addContactCustomFieldRequest: {},
}))

const { addContactCustomFields } = await import(
  "../src/features/contacts/actions/add-contact-custom-field.action"
)

describe("addContactCustomFields — custom-field event ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callLog.length = 0
    mocks.findManyByIds.mockResolvedValue([{ id: "contact-1" }])
    mocks.findOrFail.mockResolvedValue({ id: "cf-1", name: "plan" })
    mocks.emitCustomFieldChanges.mockResolvedValue(undefined)
    // No existing value for the field on this contact.
    mocks.selectLimit.mockResolvedValue([])
  })

  test("writes inside the transaction and emits per contact only after commit", async () => {
    const persisted = [
      {
        customFieldId: "cf-1",
        customFieldName: "plan",
        oldValue: null,
        newValue: "pro",
      },
    ]
    mocks.setValuesInTransaction.mockResolvedValue(persisted)

    await addContactCustomFields({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        ids: ["contact-1"],
        customFieldId: "cf-1",
        operation: "set",
        value: "pro",
        clientTimezone: "Asia/Ho_Chi_Minh",
      } as never,
    })

    expect(callLog.indexOf("write")).toBeLessThan(callLog.indexOf("commit"))
    expect(callLog.indexOf("emit")).toBeGreaterThan(callLog.indexOf("commit"))

    expect(mocks.setValuesInTransaction).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [{ customFieldId: "cf-1", value: "pro" }],
        sourceTimezone: "Asia/Ho_Chi_Minh",
      },
      txHandle,
    )
    expect(mocks.emitCustomFieldChanges).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      changes: persisted,
    })
  })

  test("emits nothing when no contact value actually changes", async () => {
    // Existing value equals the incoming value -> skipped by the diff guard.
    mocks.selectLimit.mockResolvedValue([{ value: "pro" }])

    await addContactCustomFields({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        ids: ["contact-1"],
        customFieldId: "cf-1",
        operation: "set",
        value: "pro",
        clientTimezone: "Asia/Ho_Chi_Minh",
      } as never,
    })

    expect(mocks.setValuesInTransaction).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanges).not.toHaveBeenCalled()
  })
})
