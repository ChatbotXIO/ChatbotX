import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

// Real drizzle operators and schema so the UPDATE's SET/WHERE render to the
// SQL Postgres would run; only `db` is replaced to capture the builder calls.
const {
  mockInvalidateCacheByTags,
  mockReturning,
  mockSet,
  mockUpdate,
  mockWhere,
} = vi.hoisted(() => {
  const mockReturning = vi.fn()
  const mockWhere = vi.fn(() => ({ returning: mockReturning }))
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockSet }))
  return {
    mockInvalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
    mockReturning,
    mockSet,
    mockUpdate,
    mockWhere,
  }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return { ...original, db: { update: mockUpdate } }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxOperationalColumns: { sourceIdentityHistory: false },
  contactInboxRepository: {},
  workspaceRepository: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

vi.mock("../src/contact-referral-event/service", () => ({
  contactReferralEventService: {},
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { contactInboxService } = await import("../src/contact-inbox/service")

// `or(isNull(channelBlockChangedAt), lte(channelBlockChangedAt, $occurredAt))`
const GUARD_RE =
  /\("ContactInbox"\."channelBlockChangedAt" is null\)\) or \("ContactInbox"\."channelBlockChangedAt" <= \$\d+\)/

const renderWhere = () => {
  const where = mockWhere.mock.calls[0]?.[0] as unknown as SQL
  return new PgDialect().sqlToQuery(where)
}

const occurredAt = new Date("2026-10-01T10:00:00.000Z")
const base = {
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  sourceId: "U123",
  occurredAt,
}

describe("contactInboxService.setChannelBlocked ordering guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockResolvedValue([{ contactId: "contact-1" }])
  })

  test("a block stamps channelBlockedAt and channelBlockChangedAt with the event time", async () => {
    await contactInboxService.setChannelBlocked({ ...base, blocked: true })

    expect(mockSet).toHaveBeenCalledWith({
      channelBlockedAt: occurredAt,
      channelBlockChangedAt: occurredAt,
    })
    const { sql, params } = renderWhere()
    expect(sql).toMatch(GUARD_RE)
    expect(sql).toContain('"Contact"."workspaceId" = $')
    expect(params).toContain(occurredAt.toISOString())
  })

  test("an unblock clears channelBlockedAt but still applies the same guard", async () => {
    await contactInboxService.setChannelBlocked({ ...base, blocked: false })

    expect(mockSet).toHaveBeenCalledWith({
      channelBlockedAt: null,
      channelBlockChangedAt: occurredAt,
    })
    const { sql, params } = renderWhere()
    expect(sql).toMatch(GUARD_RE)
    expect(sql).toContain('"Contact"."workspaceId" = $')
    expect(params).toContain(occurredAt.toISOString())
  })

  test("invalidates the contact's inbox cache only when a row was updated", async () => {
    await contactInboxService.setChannelBlocked({ ...base, blocked: true })
    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])

    vi.clearAllMocks()
    mockReturning.mockResolvedValue([])
    await contactInboxService.setChannelBlocked({ ...base, blocked: false })
    expect(mockInvalidateCacheByTags).not.toHaveBeenCalled()
  })
})
