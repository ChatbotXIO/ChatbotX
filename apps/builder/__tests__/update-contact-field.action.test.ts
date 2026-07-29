import { beforeEach, describe, expect, test, vi } from "vitest"

// updateContactFields writes contact + custom-field changes inside one
// transaction, then emits change events. Custom-field events MUST fire only
// after the transaction commits: the trigger worker re-reads the value from the
// DB, so emitting mid-transaction can surface uncommitted or rolled-back data.
// These tests lock the write-inside-tx / emit-after-commit ordering.

const callLog: string[] = []

const mocks = vi.hoisted(() => ({
  findByIdOrFail: vi.fn(),
  contactUpdate: vi.fn(),
  updateLanguage: vi.fn(),
  setValuesInTransaction: vi.fn(),
  emitCustomFieldChanges: vi.fn(),
  emitContactInfoChangeEvents: vi.fn(),
  listCustomFields: vi.fn(),
}))

const txHandle = { __tx: true }

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    findByIdOrFail: mocks.findByIdOrFail,
    update: (...args: unknown[]) => {
      callLog.push("contact-update")
      return mocks.contactUpdate(...args)
    },
  },
  contactInboxService: { updateLanguage: mocks.updateLanguage },
  contactCustomFieldService: {
    setValuesInTransaction: (...args: unknown[]) => {
      callLog.push("write")
      return mocks.setValuesInTransaction(...args)
    },
    emitCustomFieldChanges: (...args: unknown[]) => {
      callLog.push("emit-custom-field")
      return mocks.emitCustomFieldChanges(...args)
    },
  },
  emitContactInfoChangeEvents: (...args: unknown[]) => {
    callLog.push("emit-contact-info")
    return mocks.emitContactInfoChangeEvents(...args)
  },
  normalizeLanguage: (value: unknown) => value,
  normalizeStoredTimezone: (value: unknown) => value,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (cb: (tx: unknown) => unknown) => {
      const result = await cb(txHandle)
      callLog.push("commit")
      return result
    },
  },
}))

vi.mock("@chatbotx.io/database/partials", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/database/partials")
  >("@chatbotx.io/database/partials")
  return actual
})

vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: () => ({}),
}))

vi.mock("@/features/custom-fields/queries", () => ({
  listCustomFields: mocks.listCustomFields,
}))

vi.mock("@/features/custom-fields/schemas/query", () => ({
  listCustomFieldsSearchParams: { parse: (value: unknown) => value },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("@/lib/shared-request", () => ({ maxPerPageString: "100" }))

vi.mock("../src/features/contacts/permissions", () => ({
  requireContactPermissionScope: vi.fn(),
}))

vi.mock("../src/features/contacts/schemas/action", () => ({
  updateContactFieldRequest: {},
}))

const { updateContactFields } = await import(
  "../src/features/contacts/actions/update-contact-field.action"
)

const CTX = { workspaceId: "ws-1", id: "contact-1" }

describe("updateContactFields — custom-field event ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callLog.length = 0
    mocks.findByIdOrFail.mockResolvedValue({
      id: "contact-1",
      phoneNumber: null,
      email: null,
    })
    mocks.listCustomFields.mockResolvedValue({
      data: [{ id: "cf-1", name: "plan" }],
    })
    mocks.emitCustomFieldChanges.mockResolvedValue(undefined)
    mocks.emitContactInfoChangeEvents.mockResolvedValue(undefined)
  })

  test("writes inside the transaction and emits custom-field changes only after commit", async () => {
    const persisted = [
      {
        customFieldId: "cf-1",
        customFieldName: "plan",
        oldValue: null,
        newValue: "pro",
      },
    ]
    mocks.setValuesInTransaction.mockResolvedValue(persisted)

    await updateContactFields(CTX, {
      "cf-1": "pro",
      clientTimezone: "Asia/Ho_Chi_Minh",
    } as never)

    // Write happens inside the tx; the emit happens strictly after commit.
    expect(callLog.indexOf("write")).toBeLessThan(callLog.indexOf("commit"))
    expect(callLog.indexOf("emit-custom-field")).toBeGreaterThan(
      callLog.indexOf("commit"),
    )

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

  test("does not touch the custom-field funnel when no custom fields are submitted", async () => {
    await updateContactFields(CTX, {
      firstName: "Ada",
    } as never)

    expect(mocks.setValuesInTransaction).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanges).not.toHaveBeenCalled()
    // Contact-info events still fire (unchanged behavior).
    expect(mocks.emitContactInfoChangeEvents).toHaveBeenCalledOnce()
  })
})
