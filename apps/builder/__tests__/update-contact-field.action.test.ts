import { beforeEach, describe, expect, test, vi } from "vitest"

// updateContactFields writes contact + custom-field changes inside one
// transaction, then emits change events. Custom-field events MUST fire only
// after the transaction commits: the trigger worker re-reads the value from the
// DB, so emitting mid-transaction can surface uncommitted or rolled-back data.
// These tests lock the write-inside-tx / emit-after-commit ordering.

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
  listCustomFields: vi.fn(),
  recordAuditLog: vi.fn(),
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: {
    record: (...args: unknown[]) => mocks.recordAuditLog(...args),
  },
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
  contactInboxService: {
    findByUncached: mocks.findContactInboxByUncached,
    updateLanguage: mocks.updateLanguage,
  },
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
  normalizeLanguage: (value: string | null | undefined) =>
    value?.split(localeSeparatorRegex)[0]?.toLowerCase(),
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

vi.mock("@chatbotx.io/utils", () => {
  // The `importActual` above for `@chatbotx.io/database/partials` still
  // resolves that module's own `zodBigintAsString` import through this same
  // mock registry — and its barrel re-exports every partial schema
  // (including unrelated ones, e.g. minigame.ts) whose module-eval-time
  // `.nullable()`/`.optional()` chains would break against a stub that only
  // has `{}`. This proxy chains any further method call back to itself so
  // it never breaks regardless of which Zod methods a schema happens to use.
  const proxy = new Proxy(
    {},
    {
      get() {
        return () => proxy
      },
    },
  )
  return { zodBigintAsString: () => proxy }
})

vi.mock("@/features/custom-fields/queries", () => ({
  listCustomFields: mocks.listCustomFields,
}))

vi.mock("@/features/custom-fields/schema/query", () => ({
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

vi.mock("../src/features/contacts/schema/action", () => ({
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
      firstName: null,
      lastName: null,
      gender: null,
      timezone: null,
      phoneNumber: null,
      email: null,
    })
    mocks.findContactInboxByUncached.mockResolvedValue(undefined)
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
    expect(mocks.recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "updated a contact (#contact-1)",
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

    await updateContactFields(CTX, {
      contactInboxId: "contact-inbox-1",
      language: "en_US",
      firstName: "Ada",
      lastName: "Lovelace",
      gender: "female",
      timezone: "Asia/Ho_Chi_Minh",
      phoneNumber: "84901234567",
      email: "ada@example.com",
      "cf-1": "pro",
    } as never)

    expect(mocks.contactUpdate).not.toHaveBeenCalled()
    expect(mocks.updateLanguage).not.toHaveBeenCalled()
    expect(mocks.recordAuditLog).not.toHaveBeenCalled()
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

    await updateContactFields(CTX, {
      firstName: "Grace",
      email: "ada@example.com",
    } as never)

    expect(mocks.contactUpdate).toHaveBeenCalledWith(
      CTX,
      { firstName: "Grace" },
      txHandle,
    )
    expect(mocks.updateLanguage).not.toHaveBeenCalled()
    expect(mocks.recordAuditLog).toHaveBeenCalledOnce()
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

    await updateContactFields(CTX, {
      contactInboxId: "contact-inbox-1",
      language: "en_US",
    } as never)

    expect(mocks.updateLanguage).toHaveBeenCalledWith({
      tx: txHandle,
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "contact-inbox-1",
      language: "en",
    })
    expect(mocks.contactUpdate).not.toHaveBeenCalled()
    expect(mocks.recordAuditLog).toHaveBeenCalledOnce()
    expect(mocks.emitContactInfoChangeEvents).not.toHaveBeenCalled()
  })

  test("returns without writes, emits, or audit for an empty payload", async () => {
    await updateContactFields(CTX, {} as never)

    expect(mocks.contactUpdate).not.toHaveBeenCalled()
    expect(mocks.updateLanguage).not.toHaveBeenCalled()
    expect(mocks.setValuesInTransaction).not.toHaveBeenCalled()
    expect(mocks.recordAuditLog).not.toHaveBeenCalled()
    expect(mocks.emitContactInfoChangeEvents).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanges).not.toHaveBeenCalled()
  })
})
