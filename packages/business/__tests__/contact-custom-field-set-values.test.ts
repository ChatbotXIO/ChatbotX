import { beforeEach, describe, expect, test, vi } from "vitest"

// setValues is the single write funnel for contact custom-field values. Its body
// never ran under test before (every consumer test mocks the service away), so
// the timezone-resolution chain, the skip-on-null guard, and the per-changed-
// field emit contract were all unverified end to end. These tests exercise the
// real method body against a mocked DB client.
//
// The value the method PERSISTS/EMITS is derived from the source timezone, so we
// assert on the emitted value to prove which timezone the normalizer used:
//   VN wall-clock "2026-07-22 15:30" (+7)  ->  "2026-07-22T08:30:00.000Z"

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
  loggerWarn: vi.fn(),
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
    // tx === db triggers the transaction path; run the callback against the same
    // mock so the query stubs above apply inside the transaction.
    transaction: (cb: (tx: unknown) => unknown) => cb(dbMock),
  }

  return { db: dbMock, and: vi.fn(), eq: vi.fn(), inArray: vi.fn() }
})

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: mocks.emitCustomFieldChanged,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: mocks.loggerWarn,
  }),
}))

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)
const { db } = await import("@chatbotx.io/database/client")

const DATETIME_FIELD = { id: "cf-dt", name: "booking_at", type: "datetime" }

describe("contactCustomFieldService.setValues — timezone resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contactCustomFieldFindMany.mockResolvedValue([])
  })

  test("falls back to the workspace timezone when the contact row is absent", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    mocks.contactFindFirst.mockResolvedValue(undefined)
    mocks.workspaceFindFirst.mockResolvedValue({
      timezone: "Asia/Ho_Chi_Minh",
    })

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
    })

    // Normalized against the workspace zone (+7), not UTC, and inserted as new.
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-1",
        customFieldId: "cf-dt",
        value: "2026-07-22T08:30:00.000Z",
      }),
    )
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "cf-dt",
      "booking_at",
      null,
      "2026-07-22T08:30:00.000Z",
    )
  })

  test("falls back to the workspace timezone when the contact has a null timezone", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    mocks.contactFindFirst.mockResolvedValue({ timezone: null })
    mocks.workspaceFindFirst.mockResolvedValue({
      timezone: "Asia/Ho_Chi_Minh",
    })

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "2026-07-22T08:30:00.000Z" }),
    )
  })

  test("prefers the contact timezone over the workspace timezone", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    // Contact in Tokyo (+9): 15:30 wall-clock -> 06:30Z, distinct from the +7
    // workspace result, so the emitted value proves the contact zone won.
    mocks.contactFindFirst.mockResolvedValue({ timezone: "Asia/Tokyo" })
    mocks.workspaceFindFirst.mockResolvedValue({
      timezone: "Asia/Ho_Chi_Minh",
    })

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "2026-07-22T06:30:00.000Z" }),
    )
  })

  test("stores date values offset-preserved in the source timezone", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-d", name: "birthday", type: "date" },
    ])
    mocks.contactFindFirst.mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
    mocks.workspaceFindFirst.mockResolvedValue({ timezone: "UTC" })

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-d", value: "2026-07-22" }],
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "cf-d",
        value: "2026-07-22T00:00:00+07:00",
      }),
    )
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "cf-d",
      "birthday",
      null,
      "2026-07-22T00:00:00+07:00",
    )
  })
})

describe("contactCustomFieldService.setValues — write/emit contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contactFindFirst.mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
    mocks.workspaceFindFirst.mockResolvedValue({ timezone: "UTC" })
  })

  test("skips an un-normalizable temporal value: no insert, no emit", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-d", name: "birthday", type: "date" },
    ])
    mocks.contactCustomFieldFindMany.mockResolvedValue([])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      // Impossible calendar date -> normalizer returns null -> skipped.
      fields: [{ customFieldId: "cf-d", value: "2026-02-30" }],
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    // Cache is still invalidated once (cheap, idempotent) regardless of changes.
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("is a no-op when the normalized value already matches the stored value", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    mocks.contactCustomFieldFindMany.mockResolvedValue([
      {
        id: "v1",
        contactId: "contact-1",
        customFieldId: "cf-dt",
        value: "2026-07-22T08:30:00.000Z",
      },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("updates an existing value in place and emits old -> new", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    mocks.contactCustomFieldFindMany.mockResolvedValue([
      {
        id: "v1",
        contactId: "contact-1",
        customFieldId: "cf-dt",
        value: "2020-01-01T00:00:00.000Z",
      },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      value: "2026-07-22T08:30:00.000Z",
    })
    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "cf-dt",
      "booking_at",
      "2020-01-01T00:00:00.000Z",
      "2026-07-22T08:30:00.000Z",
    )
  })

  test("does nothing when no custom-field definitions match the workspace", async () => {
    mocks.customFieldFindMany.mockResolvedValue([])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-missing", value: "whatever" }],
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })
})

describe("contactCustomFieldService.setValues — lenient spreadsheet parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contactCustomFieldFindMany.mockResolvedValue([])
    mocks.contactFindFirst.mockResolvedValue({ timezone: "Asia/Tokyo" })
    mocks.workspaceFindFirst.mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
  })

  test("parses a DMY datetime cell and stores it as the workspace-anchored UTC instant", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "23/07/2026 09:30" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "cf-dt",
        value: "2026-07-23T02:30:00.000Z",
      }),
    )
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
  })

  test("stores canonical sheet datetimes as workspace-local even when the contact has another timezone", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])
    mocks.contactFindFirst.mockRejectedValue(
      new Error("contact lookup must be skipped"),
    )

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "2026-07-23 09:30" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "cf-dt",
        value: "2026-07-23T02:30:00.000Z",
      }),
    )
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
  })

  test("parses a unix timestamp cell into a datetime UTC instant", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "1721800800" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "2024-07-24T06:00:00.000Z" }),
    )
  })

  test("warns and skips an unparseable cell under lenient parsing", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-dt", name: "booking_at", type: "datetime" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-dt", value: "definitely not a date" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)

    const [logContext] = mocks.loggerWarn.mock.calls[0]
    expect(logContext).toMatchObject({
      workspaceId: "ws-1",
      contactId: "contact-1",
      customFieldId: "cf-dt",
      type: "datetime",
    })
    expect(JSON.stringify(logContext)).not.toContain("definitely not a date")
  })

  test("strict default does not warn when skipping an un-normalizable value", async () => {
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "cf-d", name: "birthday", type: "date" },
    ])

    await contactCustomFieldService.setValues({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-d", value: "2026-02-30" }],
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })
})

describe("contactCustomFieldService.setValueByKey — temporal forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contactCustomFieldFindMany.mockResolvedValue([])
    mocks.customFieldFindFirst.mockResolvedValue({ id: "cf-dt" })
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    mocks.contactFindFirst.mockRejectedValue(
      new Error("timezone override should skip contact lookup"),
    )
    mocks.workspaceFindFirst.mockRejectedValue(
      new Error("timezone override should skip workspace lookup"),
    )
  })

  test("forwards lenient parsing and source timezone override into the setValues funnel", async () => {
    await contactCustomFieldService.setValueByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "cf-dt",
      value: "23/07/2026 09:30",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      temporalInputParsing: "lenient",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-1",
        customFieldId: "cf-dt",
        value: "2026-07-23T02:30:00.000Z",
      }),
    )
    expect(mocks.contactFindFirst).not.toHaveBeenCalled()
    expect(mocks.workspaceFindFirst).not.toHaveBeenCalled()
  })
})

// setValuesInTransaction is the write-only half of the funnel: callers that own
// an outer transaction persist inside it, then emit AFTER commit. It must never
// emit or invalidate on its own — doing so pre-commit lets the trigger worker
// (which re-reads the value from the DB) observe uncommitted or rolled-back data.
describe("contactCustomFieldService.setValuesInTransaction — write-only, defers side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contactCustomFieldFindMany.mockResolvedValue([])
    mocks.contactFindFirst.mockResolvedValue({ timezone: "Asia/Ho_Chi_Minh" })
    mocks.workspaceFindFirst.mockResolvedValue({ timezone: "UTC" })
  })

  test("persists the value but emits no event and invalidates no cache", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])

    const changes = await contactCustomFieldService.setValuesInTransaction(
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
      },
      db,
    )

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ value: "2026-07-22T08:30:00.000Z" }),
    )
    // Side effects are the caller's job, run AFTER the outer transaction commits.
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
    expect(changes).toEqual([
      {
        customFieldId: "cf-dt",
        customFieldName: "booking_at",
        oldValue: null,
        newValue: "2026-07-22T08:30:00.000Z",
      },
    ])
  })

  test("returns an empty change list when nothing changed", async () => {
    mocks.customFieldFindMany.mockResolvedValue([DATETIME_FIELD])
    mocks.contactCustomFieldFindMany.mockResolvedValue([
      {
        id: "v1",
        contactId: "contact-1",
        customFieldId: "cf-dt",
        value: "2026-07-22T08:30:00.000Z",
      },
    ])

    const changes = await contactCustomFieldService.setValuesInTransaction(
      {
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [{ customFieldId: "cf-dt", value: "2026-07-22 15:30" }],
      },
      db,
    )

    expect(changes).toEqual([])
    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })
})

// emitCustomFieldChanges is the post-commit fan-out: one trigger/webhook event
// per changed field, then a single cache invalidation. Callers invoke it once the
// outer transaction has committed so downstream consumers read durable data.
describe("contactCustomFieldService.emitCustomFieldChanges — post-commit fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("emits one event per change and invalidates the cache once", async () => {
    await contactCustomFieldService.emitCustomFieldChanges({
      workspaceId: "ws-1",
      contactId: "contact-1",
      changes: [
        {
          customFieldId: "cf-dt",
          customFieldName: "booking_at",
          oldValue: "2020-01-01T00:00:00.000Z",
          newValue: "2026-07-22T08:30:00.000Z",
        },
        {
          customFieldId: "cf-d",
          customFieldName: "birthday",
          oldValue: null,
          newValue: "2026-07-22T00:00:00+07:00",
        },
      ],
    })

    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(2)
    expect(mocks.emitCustomFieldChanged).toHaveBeenNthCalledWith(
      1,
      "ws-1",
      "contact-1",
      "cf-dt",
      "booking_at",
      "2020-01-01T00:00:00.000Z",
      "2026-07-22T08:30:00.000Z",
    )
    expect(mocks.emitCustomFieldChanged).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "contact-1",
      "cf-d",
      "birthday",
      null,
      "2026-07-22T00:00:00+07:00",
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("still invalidates the cache once when there are no changes", async () => {
    await contactCustomFieldService.emitCustomFieldChanges({
      workspaceId: "ws-1",
      contactId: "contact-1",
      changes: [],
    })

    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("logs a warning when an emit rejects but still invalidates and does not throw", async () => {
    mocks.emitCustomFieldChanged.mockRejectedValueOnce(new Error("queue down"))

    await contactCustomFieldService.emitCustomFieldChanges({
      workspaceId: "ws-1",
      contactId: "contact-1",
      changes: [
        {
          customFieldId: "cf-dt",
          customFieldName: "booking_at",
          oldValue: null,
          newValue: "2026-07-22T08:30:00.000Z",
        },
      ],
    })

    await vi.waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledOnce()
    const [logContext] = mocks.loggerWarn.mock.calls[0]
    expect(logContext).toMatchObject({
      workspaceId: "ws-1",
      contactId: "contact-1",
      customFieldId: "cf-dt",
    })
  })
})
