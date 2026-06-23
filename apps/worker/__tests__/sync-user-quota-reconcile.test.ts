import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Regression: the Redis→DB reconcile must write the *current* authoritative
// COUNT(*) for contacts/teamMembers/workspaces/channels — not a high-water max —
// so deleting any of them frees quota slots. See reconcileUser.
//
// vi.mock factories are hoisted; per-test state flows through the shared
// `state` object, never through re-declared mocks.
// ---------------------------------------------------------------------------

const state = {
  // Dequeued by each terminal `.where()` — order:
  // [contactsCount, teamMembersCount, workspacesCount, channelsCount].
  countResults: [] as number[],
  stored: null as Record<string, unknown> | null,
  capturedSets: [] as Record<string, unknown>[],
  hsetCalls: [] as unknown[][],
  hmgetResult: [null, null] as (string | null)[],
  // Owner MAC count returned by the (mocked) ContactActiveMonthly ledger.
  ledgerMac: 0,
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() =>
    Promise.resolve([{ count: state.countResults.shift() ?? 0 }]),
  )
  return chain
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {}
  chain.values = vi.fn(() => chain)
  chain.onConflictDoUpdate = vi.fn((arg: { set: Record<string, unknown> }) => {
    state.capturedSets.push(arg.set)
    return Promise.resolve()
  })
  return chain
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => makeInsertChain()),
    query: {
      userQuotaModel: { findFirst: vi.fn(async () => state.stored) },
    },
  },
  and: vi.fn((...a: unknown[]) => ({ and: a })),
  count: vi.fn(() => ({ count: true })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  ne: vi.fn((a: unknown, b: unknown) => ({ ne: [a, b] })),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    __sql: strings.join("?"),
    vals,
  }),
}))

// The handler imports a few lightweight helpers from `@chatbotx.io/business`.
// Mock them directly rather than loading the whole service+integration graph
// (which would require the full real DB schema, incompatible with the partial
// schema mock below). The helpers are pure, so re-implementing them is exact.
vi.mock("@chatbotx.io/business", () => ({
  USER_QUOTA_LABEL: "user-quota",
  liveKeyFor: (label: string, id: string) => `${label}-live:${id}`,
  parseLiveCount: (value: string | null) => {
    if (value === null) {
      return null
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  },
  userQuotaService: { invalidate: vi.fn(async () => undefined) },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { workspaceId: "contact.workspaceId" },
  inboxModel: { workspaceId: "inbox.workspaceId" },
  userQuotaModel: {
    userId: "userQuota.userId",
    contactsUsed: "userQuota.contactsUsed",
    teamMembersUsed: "userQuota.teamMembersUsed",
    workspacesUsed: "userQuota.workspacesUsed",
    channelsUsed: "userQuota.channelsUsed",
    macUsed: "userQuota.macUsed",
  },
  workspaceMemberModel: { workspaceId: "wm.workspaceId", role: "wm.role" },
  workspaceModel: { id: "ws.id", ownerId: "ws.ownerId" },
}))

const redisClient = {
  hset: vi.fn((...args: unknown[]) => {
    state.hsetCalls.push(args)
    return Promise.resolve()
  }),
  hmget: vi.fn(async () => state.hmgetResult),
}

vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: { useExisting: vi.fn(async () => redisClient) },
  distributedStore: { delete: vi.fn(async () => undefined) },
}))

const countActiveContactsForOwner = vi.fn(async () => state.ledgerMac)
vi.mock("@chatbotx.io/analytics", () => ({
  macRepository: { countActiveContactsForOwner },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { reconcileUser } = await import(
  "../src/schedule/handlers/sync-user-quota"
)

describe("reconcileUser — contacts/teamMembers reflect the current count", () => {
  beforeEach(() => {
    state.countResults = []
    state.stored = null
    state.capturedSets = []
    state.hsetCalls = []
    state.hmgetResult = [null, null]
    state.ledgerMac = 0
    redisClient.hset.mockClear()
    countActiveContactsForOwner.mockClear()
  })

  test("writes the recomputed count even when LOWER than the stored value (deletions free slots)", async () => {
    // Source-of-truth COUNT(*) after deletions:
    // [contacts, teamMembers, workspaces, channels].
    state.countResults = [3, 1, 2, 4]
    // DB previously stored a higher (high-water) value.
    state.stored = {
      contactsUsed: 10,
      teamMembersUsed: 5,
      workspacesUsed: 8,
      channelsUsed: 9,
      macUsed: 0,
      periodStart: null,
    }

    await reconcileUser("user-1")

    // The reconcile upsert must persist the exact current count, not GREATEST.
    const set = state.capturedSets[0]
    expect(set.contactsUsed).toBe(3)
    expect(set.teamMembersUsed).toBe(1)
    expect(set.workspacesUsed).toBe(2)
    expect(set.channelsUsed).toBe(4)

    // The live Redis counter must mirror the current count, not the stale values.
    expect(state.hsetCalls[0]).toEqual([
      "user-quota-live:user-1",
      "contacts",
      "3",
      "teamMembers",
      "1",
      "workspaces",
      "2",
      "channels",
      "4",
    ])
  })

  test("writes increases too (count grew since last sync)", async () => {
    state.countResults = [42, 7, 3, 5]
    state.stored = {
      contactsUsed: 40,
      teamMembersUsed: 6,
      workspacesUsed: 2,
      channelsUsed: 4,
      macUsed: 0,
      periodStart: null,
    }

    await reconcileUser("user-2")

    const set = state.capturedSets[0]
    expect(set.contactsUsed).toBe(42)
    expect(set.teamMembersUsed).toBe(7)
    expect(set.workspacesUsed).toBe(3)
    expect(set.channelsUsed).toBe(5)
  })
})

describe("reconcileUser — macUsed is derived from the ContactActiveMonthly ledger", () => {
  const PERIOD = "2026-06-01T00:00:00.000Z"

  beforeEach(() => {
    state.countResults = [0, 0, 0, 0]
    state.capturedSets = []
    state.hsetCalls = []
    redisClient.hset.mockClear()
    countActiveContactsForOwner.mockClear()
    state.ledgerMac = 0
  })

  test("resetting plan in its current period re-grounds macUsed on the ledger count", async () => {
    // Live counter drifted low (a lost Redis increment); DB is also stale.
    state.hmgetResult = ["3", PERIOD]
    state.ledgerMac = 7
    state.stored = {
      contactsUsed: 0,
      teamMembersUsed: 0,
      workspacesUsed: 0,
      channelsUsed: 0,
      macUsed: 5,
      periodStart: new Date(PERIOD),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
    }

    await reconcileUser("user-1")

    expect(countActiveContactsForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-1", cumulative: false }),
    )
    // The live counter is re-grounded on the ledger truth.
    expect(state.hsetCalls).toContainEqual([
      "user-quota-live:user-1",
      "mac",
      "7",
      "macPeriodStart",
      PERIOD,
    ])
    // macUsed is persisted to the ledger count (self-heals the drift).
    expect(state.capturedSets.some((set) => set.macUsed === 7)).toBe(true)
  })

  test("lifetime plan (no periodEnd) keeps the accumulate path, not the ledger", async () => {
    state.hmgetResult = ["10", PERIOD]
    state.ledgerMac = 4
    state.stored = {
      contactsUsed: 0,
      teamMembersUsed: 0,
      workspacesUsed: 0,
      channelsUsed: 0,
      macUsed: 10,
      periodStart: new Date(PERIOD),
      periodEnd: null,
    }

    await reconcileUser("user-1")

    expect(countActiveContactsForOwner).not.toHaveBeenCalled()
    // No mac drift to persist (live === DB within the stable lifetime period).
    expect(state.capturedSets.some((set) => "macUsed" in set)).toBe(false)
  })
})
