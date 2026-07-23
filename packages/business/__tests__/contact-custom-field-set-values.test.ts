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
      customFieldModel: { findMany: mocks.customFieldFindMany },
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

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)

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
