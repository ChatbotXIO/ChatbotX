import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// ContactService.setBroadcastSubscription (packages/business/src/contact/service.ts)
// — the conditional write the worker's subscribeBroadcast/unsubscribeBroadcast
// flow steps now delegate to (moved off a raw `db` write in
// apps/worker/src/integration/handlers/contact.ts). Subscribing folds
// `isNull(broadcastSubscribedAt)` into the WHERE to stay idempotent (a
// contact already subscribed keeps its original subscription date);
// unsubscribing has no such guard.
// ---------------------------------------------------------------------------

const { mockDbUpdate } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  db: { update: mockDbUpdate },
  eq: vi.fn((left: unknown, right: unknown) => ({ __eq: [left, right] })),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn((column: unknown) => ({ __isNull: column })),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return actual
})

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn(),
  emitContactInfoUpdated: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService: {},
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {},
}))

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: {},
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: {},
}))

const { contactService } = await import("../src/contact/service")
const {
  and: andMock,
  eq: eqMock,
  isNull: isNullMock,
} = await import("@chatbotx.io/database/client")

const buildUpdateClient = (returningResult: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returningResult)
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { returning, set, update, where }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactService.setBroadcastSubscription", () => {
  test("subscribing: sets broadcastSubscribedAt to a Date and folds isNull(broadcastSubscribedAt) into the WHERE", async () => {
    const updated = {
      id: "contact-1",
      workspaceId: "ws-1",
      broadcastSubscribedAt: new Date(),
    }
    const dbUpdateClient = buildUpdateClient([updated])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    const before = Date.now()
    const result = await contactService.setBroadcastSubscription({
      workspaceId: "ws-1",
      id: "contact-1",
      subscribed: true,
    })
    const after = Date.now()

    expect(dbUpdateClient.set).toHaveBeenCalledOnce()
    const setArg = dbUpdateClient.set.mock.calls[0][0] as {
      broadcastSubscribedAt: Date
    }
    expect(setArg.broadcastSubscribedAt).toBeInstanceOf(Date)
    const ts = setArg.broadcastSubscribedAt.getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)

    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "contact-1")
    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "ws-1")
    expect(isNullMock).toHaveBeenCalledOnce()
    expect(andMock).toHaveBeenCalledTimes(1)
    expect(andMock.mock.calls[0]).toHaveLength(3)

    expect(result).toEqual(updated)
    expect(invalidateSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["contact-1"],
    })
  })

  test("subscribing is idempotent: zero rows matched (already subscribed) → returns undefined, no cache invalidation", async () => {
    const dbUpdateClient = buildUpdateClient([])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    const result = await contactService.setBroadcastSubscription({
      workspaceId: "ws-1",
      id: "contact-1",
      subscribed: true,
    })

    expect(result).toBeUndefined()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  test("unsubscribing: sets broadcastSubscribedAt to null with no isNull guard in the WHERE", async () => {
    const updated = {
      id: "contact-1",
      workspaceId: "ws-1",
      broadcastSubscribedAt: null,
    }
    const dbUpdateClient = buildUpdateClient([updated])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    const result = await contactService.setBroadcastSubscription({
      workspaceId: "ws-1",
      id: "contact-1",
      subscribed: false,
    })

    const setArg = dbUpdateClient.set.mock.calls[0][0] as {
      broadcastSubscribedAt: null
    }
    expect(setArg.broadcastSubscribedAt).toBeNull()
    expect(isNullMock).not.toHaveBeenCalled()
    // and(id, workspaceId, undefined) — Drizzle's and() drops the trailing
    // undefined guard clause internally; the mock just records the raw args.
    expect(andMock.mock.calls[0]).toEqual([
      expect.anything(),
      expect.anything(),
      undefined,
    ])

    expect(result).toEqual(updated)
    expect(invalidateSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["contact-1"],
    })
  })
})
