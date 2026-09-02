import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// ContactService.updateIfProfileNameEmpty — the atomic conditional write
// (packages/business/src/contact/service.ts) that folds "both firstName and
// lastName are still empty" into the UPDATE's own WHERE clause — matching
// `hasEmptyProfileName`'s null-or-whitespace-only semantics — instead of a
// separate read-then-write. Closes the TOCTOU race
// `contactProfileRefreshService.refresh` used to have: a name written
// between an eligibility check and an unconditional `update()` used to get
// silently clobbered.
//
// The DB layer is mocked (mirrors contact-service-update-events.test.ts's
// existing pattern for `contactService.update`), so these tests verify:
// (a) the WHERE clause is built with the id/workspaceId/name-empty
// predicate the finding specified, and (b) the method's own branching on
// what the (real) DB would have matched — a row (name was still empty) vs
// zero rows (a name was already set by write time). The btrim/coalesce SQL
// itself is PostgreSQL-specific and is not re-evaluated by this mock.
// ---------------------------------------------------------------------------

const { mockDbUpdate, mockEmitContactInfoUpdated } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockEmitContactInfoUpdated: vi.fn(),
}))

const sqlCalls: Array<{ strings: readonly string[]; values: unknown[] }> = []

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  db: { update: mockDbUpdate },
  eq: vi.fn((left: unknown, right: unknown) => ({ __eq: [left, right] })),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const entry = { strings: [...strings], values }
    sqlCalls.push(entry)
    return { __sql: entry }
  },
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
  emitContactInfoUpdated: mockEmitContactInfoUpdated,
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
const { and: andMock, eq: eqMock } = await import(
  "@chatbotx.io/database/client"
)
const { PROFILE_NAME_BLANK_CHARACTERS } = await import(
  "../src/contact/profile-refresh/rules"
)

const buildUpdateClient = (returningResult: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returningResult)
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { returning, set, update, where }
}

beforeEach(() => {
  vi.clearAllMocks()
  sqlCalls.length = 0
})

describe("contactService.updateIfProfileNameEmpty", () => {
  test("WHERE scopes by id AND workspaceId — never touches another workspace's row", async () => {
    const dbUpdateClient = buildUpdateClient([
      { id: "contact-1", workspaceId: "ws-1", firstName: "Jane" },
    ])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue({
      id: "contact-1",
      workspaceId: "ws-1",
      firstName: null,
      lastName: null,
    } as never)
    vi.spyOn(contactService, "invalidate").mockResolvedValue(undefined)

    await contactService.updateIfProfileNameEmpty(
      { workspaceId: "ws-1", id: "contact-1" },
      { firstName: "Jane" },
    )

    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "contact-1")
    expect(eqMock).toHaveBeenCalledWith(expect.anything(), "ws-1")
    expect(andMock).toHaveBeenCalledTimes(1)
    // id, workspaceId, firstName-empty, lastName-empty
    expect(andMock.mock.calls[0]).toHaveLength(4)
  })

  test("the name-empty predicate matches hasEmptyProfileName semantics (NULL-or-blank via btrim(text, characters)/coalesce) for both firstName and lastName, bound to the shared PROFILE_NAME_BLANK_CHARACTERS constant", async () => {
    const dbUpdateClient = buildUpdateClient([{ id: "contact-1" }])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue({} as never)
    vi.spyOn(contactService, "invalidate").mockResolvedValue(undefined)

    await contactService.updateIfProfileNameEmpty(
      { workspaceId: "ws-1", id: "contact-1" },
      { firstName: "Jane" },
    )

    expect(sqlCalls).toHaveLength(2)
    for (const call of sqlCalls) {
      const text = call.strings.join("?")
      expect(text).toContain("btrim")
      expect(text).toContain("coalesce")
      expect(text).toContain("''")
      // Two-argument btrim(text, characters) — Postgres' single-argument
      // btrim only strips ASCII space, which would desync from JS's
      // .trim() (tab/NBSP/ideographic-space/etc. — see
      // PROFILE_NAME_BLANK_CHARACTERS in profile-refresh/rules.ts). The
      // character set is a BOUND parameter (call.values), never
      // interpolated into the SQL text itself.
      expect(call.values).toHaveLength(2)
      expect(call.values[1]).toBe(PROFILE_NAME_BLANK_CHARACTERS)
    }
  })

  test("row updated (name still empty when the UPDATE ran) → returns the updated contact and invalidates the cache", async () => {
    const existing = {
      id: "contact-1",
      workspaceId: "ws-1",
      phoneNumber: null,
      email: null,
    }
    const updated = { ...existing, firstName: "Jane" }
    const dbUpdateClient = buildUpdateClient([updated])
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue(
      existing as never,
    )
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    const result = await contactService.updateIfProfileNameEmpty(
      { workspaceId: "ws-1", id: "contact-1" },
      { firstName: "Jane" },
    )

    expect(result).toEqual(updated)
    expect(invalidateSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["contact-1"],
    })
  })

  test("zero rows matched (a name was set concurrently before the UPDATE ran) → returns undefined, no cache invalidation, no events", async () => {
    const dbUpdateClient = buildUpdateClient([]) // simulates the WHERE predicate no longer matching
    mockDbUpdate.mockImplementation(dbUpdateClient.update)
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue({
      id: "contact-1",
      workspaceId: "ws-1",
      firstName: null,
      lastName: null,
    } as never)
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    const result = await contactService.updateIfProfileNameEmpty(
      { workspaceId: "ws-1", id: "contact-1" },
      { firstName: "Jane" },
    )

    expect(result).toBeUndefined()
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })

  test("does not emit before a caller-owned transaction commits (mirrors update())", async () => {
    const existing = { id: "contact-1", workspaceId: "ws-1" }
    const updated = { ...existing, firstName: "Jane" }
    const txUpdateClient = buildUpdateClient([updated])
    const tx = { update: txUpdateClient.update }
    vi.spyOn(contactService, "findByIdOrFail").mockResolvedValue(
      existing as never,
    )
    vi.spyOn(contactService, "invalidate").mockResolvedValue(undefined)

    await contactService.updateIfProfileNameEmpty(
      { workspaceId: "ws-1", id: "contact-1" },
      { firstName: "Jane" },
      tx as never,
    )

    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })
})
