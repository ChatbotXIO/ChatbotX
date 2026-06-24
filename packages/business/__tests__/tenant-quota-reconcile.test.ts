import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Regression: the pooled (tenant-level) Redis→DB reconcile must write the
// *current* authoritative COUNT(*) for contacts/teamMembers/workspaces/channels
// — not a high-water max — so deletions free pooled quota slots.
// See TenantQuotaService.reconcileFromDb.
// ---------------------------------------------------------------------------

const state = {
  countResults: [] as number[],
  macSum: null as string | null,
  capturedSets: [] as Record<string, unknown>[],
  hsetCalls: [] as unknown[][],
}

// `reconcileFromDb` fires five selects: contacts, teamMembers, workspaces and
// channels COUNTs (in that order), plus the mac SUM. Distinguish the mac query
// by its `{ total }` projection so it resolves to the summed string (or null)
// rather than a count.
function makeSelectChain(projection: Record<string, unknown>) {
  const isMacSum = "total" in projection
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() =>
    Promise.resolve([
      isMacSum
        ? { total: state.macSum }
        : { count: state.countResults.shift() ?? 0 },
    ]),
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
    select: vi.fn((projection: Record<string, unknown>) =>
      makeSelectChain(projection ?? {}),
    ),
    insert: vi.fn(() => makeInsertChain()),
    query: {
      tenantQuotaUsageModel: {
        // No longer read by reconcileFromDb after the fix; kept defensively.
        findFirst: vi.fn(async () => null),
      },
    },
  },
  and: vi.fn((...a: unknown[]) => ({ and: a })),
  count: vi.fn(() => ({ count: true })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  ne: vi.fn((a: unknown, b: unknown) => ({ ne: [a, b] })),
  gt: vi.fn((a: unknown, b: unknown) => ({ gt: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
  sum: vi.fn((col: unknown) => ({ total: col })),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    __sql: strings.join("?"),
    vals,
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { workspaceId: "contact.workspaceId" },
  inboxModel: { workspaceId: "inbox.workspaceId" },
  tenantQuotaUsageModel: {
    tenantId: "tenantQuota.tenantId",
    contactsUsed: "tenantQuota.contactsUsed",
    teamMembersUsed: "tenantQuota.teamMembersUsed",
    workspacesUsed: "tenantQuota.workspacesUsed",
    channelsUsed: "tenantQuota.channelsUsed",
    macUsed: "tenantQuota.macUsed",
  },
  workspaceMacModel: {
    workspaceId: "wmac.workspaceId",
    macCount: "wmac.macCount",
    periodStart: "wmac.periodStart",
    periodEnd: "wmac.periodEnd",
  },
  workspaceMemberModel: { workspaceId: "wm.workspaceId", role: "wm.role" },
  workspaceModel: { id: "ws.id", tenantId: "ws.tenantId" },
}))

const redisClient = {
  hset: vi.fn((...args: unknown[]) => {
    state.hsetCalls.push(args)
    return Promise.resolve()
  }),
}

vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: { useExisting: vi.fn(async () => redisClient) },
  distributedStore: { delete: vi.fn(async () => undefined) },
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock("../src/user-quota/service", () => ({ userQuotaService: {} }))

const { tenantQuotaService } = await import("../src/tenant-quota/service")

describe("TenantQuotaService.reconcileFromDb — pooled current count", () => {
  beforeEach(() => {
    state.countResults = []
    state.macSum = null
    state.capturedSets = []
    state.hsetCalls = []
    redisClient.hset.mockClear()
  })

  test("writes the recomputed pooled count even when LOWER than the stored value", async () => {
    // order: contacts, teamMembers, workspaces, channels
    state.countResults = [3, 1, 2, 4]
    state.macSum = "42"

    await tenantQuotaService.reconcileFromDb("tenant-1")

    const set = state.capturedSets[0]
    expect(set.contactsUsed).toBe(3)
    expect(set.teamMembersUsed).toBe(1)
    expect(set.workspacesUsed).toBe(2)
    expect(set.channelsUsed).toBe(4)
    expect(set.macUsed).toBe(42)

    expect(state.hsetCalls[0]).toEqual([
      "tenant-quota-live:tenant-1",
      "contacts",
      "3",
      "teamMembers",
      "1",
      "workspaces",
      "2",
      "channels",
      "4",
      "mac",
      "42",
    ])
  })

  test("sums the WorkspaceMac rollup into pooled macUsed (advances with usage)", async () => {
    state.countResults = [5, 2, 1, 3]
    state.macSum = "137"

    await tenantQuotaService.reconcileFromDb("tenant-1")

    expect(state.capturedSets[0].macUsed).toBe(137)
    expect(state.hsetCalls[0]).toContain("mac")
    expect(state.hsetCalls[0]).toContain("137")
  })

  test("recomputes pooled workspaces and channels so deletions free pooled slots", async () => {
    state.countResults = [0, 0, 0, 0]
    state.macSum = "0"

    await tenantQuotaService.reconcileFromDb("tenant-1")

    const set = state.capturedSets[0]
    expect(set.workspacesUsed).toBe(0)
    expect(set.channelsUsed).toBe(0)
  })

  test("treats a null SUM (no active-period rows) as 0 — resets at rollover", async () => {
    state.countResults = [0, 0, 0, 0]
    state.macSum = null

    await tenantQuotaService.reconcileFromDb("tenant-1")

    expect(state.capturedSets[0].macUsed).toBe(0)
    expect(state.hsetCalls[0]).toEqual([
      "tenant-quota-live:tenant-1",
      "contacts",
      "0",
      "teamMembers",
      "0",
      "workspaces",
      "0",
      "channels",
      "0",
      "mac",
      "0",
    ])
  })
})
