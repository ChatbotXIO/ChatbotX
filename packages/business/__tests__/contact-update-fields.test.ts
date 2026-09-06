// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// updateFieldsAndCustomFields writes contact + custom-field changes inside
// one transaction, then emits change events. Custom-field events MUST fire
// only after the transaction commits: the trigger worker re-reads the value
// from the DB, so emitting mid-transaction can surface uncommitted or
// rolled-back data. These tests lock the write-inside-tx / emit-after-commit
// ordering.

const localeSeparatorRegex = /[-_]/
const callLog: string[] = []

const mocks = vi.hoisted(() => ({
  findByIdOrFail: vi.fn(),
  findContactInboxByUncached: vi.fn(),
  contactUpdate: vi.fn(),
  updateLanguage: vi.fn(),
  setValuesInTransaction: vi.fn(),
  emitCustomFieldChanges: vi.fn(),
  emitContactInfoChangeEvents: vi.fn(),
  customFieldList: vi.fn(),
  dispatchAuditRecord: vi.fn(),
}))

const txHandle = { __tx: true }

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: (...args: unknown[]) =>
    mocks.dispatchAuditRecord(...args),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {
    findByUncached: mocks.findContactInboxByUncached,
    updateLanguage: mocks.updateLanguage,
  },
}))

vi.mock("../src/contact-custom-field/service", () => ({
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
}))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { list: mocks.customFieldList },
}))

vi.mock("../src/contact-locale", () => ({
  normalizeLanguage: (value: string | null | undefined) =>
    value?.split(localeSeparatorRegex)[0]?.toLowerCase(),
  normalizeStoredTimezone: (value: unknown) => value,
}))

vi.mock("./contact-info-changes", () => ({
  emitContactInfoChangeEvents: (...args: unknown[]) => {
    callLog.push("emit-contact-info")
    return mocks.emitContactInfoChangeEvents(...args)
  },
}))

vi.mock("../src/contact/contact-info-changes", () => ({
  emitContactInfoChangeEvents: (...args: unknown[]) => {
    callLog.push("emit-contact-info")
    return mocks.emitContactInfoChangeEvents(...args)
  },
}))

vi.mock("./service", () => ({
  contactService: {
    findByIdOrFail: mocks.findByIdOrFail,
    update: (...args: unknown[]) => {
      callLog.push("contact-update")
      return mocks.contactUpdate(...args)
    },
  },
}))

vi.mock("../src/contact/service", () => ({
  contactService: {
    findByIdOrFail: mocks.findByIdOrFail,
    update: (...args: unknown[]) => {
      callLog.push("contact-update")
      return mocks.contactUpdate(...args)
    },
  },
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

vi.mock("@chatbotx.io/database/partials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/partials")>()
  return actual
})

const { updateFieldsAndCustomFields } = await import(
  "../src/contact/update-fields"
)

const CTX = { workspaceId: "ws-1", id: "contact-1" }

describe("contactService.updateFieldsAndCustomFields — custom-field event ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callLog.length = 0
    mocks.findByIdOrFail.mockResolvedValue({
      id: "contact-1",
      firstName: null,
      lastName: null,
      gender: null,
      timezone: null,
      phoneNumber: null,
      email: null,
    })
    mocks.findContactInboxByUncached.mockResolvedValue(undefined)
    mocks.customFieldList.mockResolvedValue({
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

    await updateFieldsAndCustomFields(CTX, {
      "cf-1": "pro",
      clientTimezone: "Asia/Ho_Chi_Minh",
    })

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
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "updated a contact (#contact-1)",
    })
  })

  test("does not touch the custom-field funnel when no custom fields are submitted", async () => {
    await updateFieldsAndCustomFields(CTX, { firstName: "Ada" })

    expect(mocks.setValuesInTransaction).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanges).not.toHaveBeenCalled()
    expect(mocks.emitContactInfoChangeEvents).toHaveBeenCalledOnce()
  })

  test("skips contact writes, emits, and audit for an unchanged payload", async () => {
    mocks.findByIdOrFail.mockResolvedValue({
      id: "contact-1",
      firstName: "Ada",
      lastName: "Lovelace",
      gender: "female",
      timezone: "Asia/Ho_Chi_Minh",
      phoneNumber: "84901234567",
      email: "ada@example.com",
    })
    mocks.findContactInboxByUncached.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      language: "en",
    })
    mocks.setValuesInTransaction.mockResolvedValue([])

    await updateFieldsAndCustomFields(CTX, {
      contactInboxId: "contact-inbox-1",
      language: "en_US",
      firstName: "Ada",
      lastName: "Lovelace",
      gender: "female",
      timezone: "Asia/Ho_Chi_Minh",
      phoneNumber: "84901234567",
      email: "ada@example.com",
      "cf-1": "pro",
    })

    expect(mocks.contactUpdate).not.toHaveBeenCalled()
    expect(mocks.updateLanguage).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
    expect(mocks.emitContactInfoChangeEvents).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanges).not.toHaveBeenCalled()
  })

  test("updates, emits, and audits only the changed contact fields", async () => {
    mocks.findByIdOrFail.mockResolvedValue({
      id: "contact-1",
      firstName: "Ada",
      phoneNumber: null,
      email: "ada@example.com",
    })

    await updateFieldsAndCustomFields(CTX, {
      firstName: "Grace",
      email: "ada@example.com",
    })

    expect(mocks.contactUpdate).toHaveBeenCalledWith(
      CTX,
      { firstName: "Grace" },
      txHandle,
    )
    expect(mocks.updateLanguage).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledOnce()
    expect(mocks.emitContactInfoChangeEvents).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      expect.objectContaining({ firstName: "Ada" }),
      { phoneNumber: null, email: "ada@example.com" },
    )
  })

  test("updates language and audits when the contact inbox language changed", async () => {
    mocks.findContactInboxByUncached.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      language: "vi",
    })

    await updateFieldsAndCustomFields(CTX, {
      contactInboxId: "contact-inbox-1",
      language: "en_US",
    })

    expect(mocks.updateLanguage).toHaveBeenCalledWith({
      tx: txHandle,
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
      language: "en",
    })
    expect(mocks.contactUpdate).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledOnce()
    expect(mocks.emitContactInfoChangeEvents).not.toHaveBeenCalled()
  })

  test("returns without writes, emits, or audit for an empty payload", async () => {
    await updateFieldsAndCustomFields(CTX, {})

    expect(mocks.contactUpdate).not.toHaveBeenCalled()
    expect(mocks.updateLanguage).not.toHaveBeenCalled()
    expect(mocks.setValuesInTransaction).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
    expect(mocks.emitContactInfoChangeEvents).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanges).not.toHaveBeenCalled()
  })
})
