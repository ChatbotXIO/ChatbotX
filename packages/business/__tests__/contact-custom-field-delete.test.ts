import { beforeEach, describe, expect, test, vi } from "vitest"

// Delete emit contract (queue-safe by design):
//   - deleteByKey (single contact) is the ONLY delete that emits
//     customFieldChanged(value -> null). It snapshots the value BEFORE deleting,
//     emits an accurate old -> null, and stays silent on a no-op delete.
//   - deleteByCustomFieldId (bulk, variadic contact count) emits NOTHING. Firing
//     one event per contact would enqueue one trigger/webhook job per contact, so
//     clearing a field across a large audience could burst the queues. It only
//     runs the delete + a single batched cache invalidation for all targets.
// deleteByKey once regressed silently when the flow-step clearContactCustomField
// write path moved to the service, because the only caller test (rich-response)
// mocks the service method and never runs its body.

const mocks = vi.hoisted(() => ({
  customFieldFindFirst: vi.fn(),
  contactCustomFieldFindMany: vi.fn(),
  findValue: vi.fn(),
  deleteWhere: vi.fn(async () => undefined),
  emitCustomFieldChanged: vi.fn(async () => undefined),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      customFieldModel: { findFirst: mocks.customFieldFindFirst },
      contactCustomFieldModel: { findMany: mocks.contactCustomFieldFindMany },
    },
    delete: () => ({ where: mocks.deleteWhere }),
  },
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: mocks.emitCustomFieldChanged,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/contact-custom-field/value-service", () => ({
  contactCustomFieldValueService: { findValue: mocks.findValue },
}))

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)

describe("contactCustomFieldService.deleteByKey", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves the keyword, snapshots the value, and emits customFieldChanged(oldValue -> null)", async () => {
    // Arrange
    mocks.customFieldFindFirst.mockResolvedValue({
      id: "cf-1",
      name: "Birthday",
    })
    mocks.findValue.mockResolvedValue("2026-07-21T17:00:00.000Z")

    // Act
    await contactCustomFieldService.deleteByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "Birthday",
    })

    // Assert: value snapshotted BEFORE delete, one event, one batched cache call.
    expect(mocks.findValue).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "cf-1",
    })
    expect(mocks.deleteWhere).toHaveBeenCalledOnce()
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledTimes(1)
    expect(mocks.emitCustomFieldChanged).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "cf-1",
      "Birthday",
      "2026-07-21T17:00:00.000Z",
      null,
    )
    // The single contact's cache is invalidated so the detail view refreshes.
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "contacts",
      "contacts:ws-1",
      "contacts:contact-1",
    ])
  })

  test("does not emit when the contact had no stored value (no-op delete), but still deletes and invalidates", async () => {
    // Arrange
    mocks.customFieldFindFirst.mockResolvedValue({ id: "cf-2", name: "Plan" })
    mocks.findValue.mockResolvedValue(null)

    // Act
    await contactCustomFieldService.deleteByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "Plan",
    })

    // Assert: the delete still runs, but nothing changed so no event fires.
    expect(mocks.deleteWhere).toHaveBeenCalledOnce()
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledOnce()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
  })

  test("throws and neither reads, deletes, nor emits when the keyword cannot be resolved", async () => {
    // Arrange
    mocks.customFieldFindFirst.mockResolvedValue(undefined)

    // Act / Assert
    await expect(
      contactCustomFieldService.deleteByKey({
        workspaceId: "ws-1",
        contactId: "contact-1",
        keyword: "does-not-exist",
      }),
    ).rejects.toThrow()

    expect(mocks.findValue).not.toHaveBeenCalled()
    expect(mocks.deleteWhere).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})

describe("contactCustomFieldService.deleteByCustomFieldId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("bulk delete stays event-free and invalidates every target's cache in one batched call", async () => {
    // Act: clear the field from a large audience.
    await contactCustomFieldService.deleteByCustomFieldId({
      workspaceId: "ws-1",
      contactIds: ["c1", "c2", "c3"],
      customFieldId: "cf-1",
    })

    // Assert: exactly one delete, ZERO events (no per-contact queue fan-out),
    // and a single cache invalidation carrying every targeted contact's tag.
    expect(mocks.deleteWhere).toHaveBeenCalledOnce()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    // No snapshot / name lookup is needed when we never emit.
    expect(mocks.findValue).not.toHaveBeenCalled()
    expect(mocks.contactCustomFieldFindMany).not.toHaveBeenCalled()
    expect(mocks.customFieldFindFirst).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "contacts",
      "contacts:ws-1",
      "contacts:c1",
      "contacts:c2",
      "contacts:c3",
    ])
  })

  test("is a no-op for an empty contactIds list", async () => {
    // Act
    await contactCustomFieldService.deleteByCustomFieldId({
      workspaceId: "ws-1",
      contactIds: [],
      customFieldId: "cf-1",
    })

    // Assert: nothing touched at all.
    expect(mocks.deleteWhere).not.toHaveBeenCalled()
    expect(mocks.emitCustomFieldChanged).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
