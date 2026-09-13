import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// userQuotaService — the non-reseller self-reconcile surface moved from
// sync-user-quota.ts: reconcileUserSelfUsage, persistMacUsed,
// applyMonthlyBotMessagesReset. AGENTS.md invariants 11/12: counts are
// assigned directly (never GREATEST); onConflictDoUpdate upserts must never
// become plain inserts. Mirrors the mock scaffolding in
// user-quota-bootstrap-plan.test.ts.
// ---------------------------------------------------------------------------

const {
  dbInsert,
  dbSelect,
  countDistinctTeamMembersForOwner,
  findFirstUserQuota,
  hset,
  userQuotaModel,
  countResults,
} = vi.hoisted(() => {
  const userQuotaModel = {
    userId: "userId-column",
    contactsUsed: "contactsUsed-column",
    workspacesUsed: "workspacesUsed-column",
    channelsUsed: "channelsUsed-column",
    teamMembersUsed: "teamMembersUsed-column",
    macUsed: "macUsed-column",
    monthlyBotMessagesUsed: "monthlyBotMessagesUsed-column",
    monthlyBotMessagesPeriodStart: "monthlyBotMessagesPeriodStart-column",
  }
  const insertBuilder = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  }
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.onConflictDoUpdate.mockReturnValue(Promise.resolve(undefined))

  // Dequeued in the order reconcileUserSelfUsage issues them:
  // [contacts, workspaces, channels]. teamMembers comes from
  // countDistinctTeamMembersForOwner, not a select.
  const countResults: number[] = []
  const selectBuilder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(async () => [{ count: countResults.shift() ?? 3 }]),
  }
  selectBuilder.from.mockReturnValue(selectBuilder)
  selectBuilder.innerJoin.mockReturnValue(selectBuilder)

  return {
    dbInsert: vi.fn(() => insertBuilder),
    dbSelect: vi.fn(() => selectBuilder),
    countDistinctTeamMembersForOwner: vi.fn(async () => 2),
    findFirstUserQuota: vi.fn(async () => ({
      macUsed: 10,
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-02-01T00:00:00Z"),
      monthlyBotMessagesPeriodStart: new Date("2026-01-01T00:00:00Z"),
    })),
    hset: vi.fn(async () => undefined),
    userQuotaModel,
    countResults,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: dbInsert,
    select: dbSelect,
    query: { userQuotaModel: { findFirst: findFirstUserQuota } },
  },
  and: (...args: unknown[]) => ({ and: args }),
  count: vi.fn(() => "count()"),
  countDistinct: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gt: vi.fn(),
  lte: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
    { raw: vi.fn() },
  ),
  sum: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({ planStatuses: {} }))

vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  contactModel: { workspaceId: "contact.workspaceId" },
  inboxModel: { workspaceId: "inbox.workspaceId" },
  userQuotaModel,
  workspaceMacModel: {},
  workspaceMemberModel: {},
  workspaceModel: { id: "workspace.id", ownerId: "workspace.ownerId" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: {
    useExisting: vi.fn(async () => ({ hset })),
  },
  distributedStore: {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("../src/keys", () => ({ isCloud: vi.fn(() => true) }))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const { userQuotaService } = await import("../src/user-quota/service")

beforeEach(() => {
  vi.clearAllMocks()
  countResults.length = 0
  countDistinctTeamMembersForOwner.mockResolvedValue(2)
  findFirstUserQuota.mockResolvedValue({
    macUsed: 10,
    periodStart: new Date("2026-01-01T00:00:00Z"),
    periodEnd: new Date("2026-02-01T00:00:00Z"),
    monthlyBotMessagesPeriodStart: new Date("2026-01-01T00:00:00Z"),
  })
  vi.spyOn(
    userQuotaService,
    "countDistinctTeamMembersForOwner",
  ).mockImplementation(countDistinctTeamMembersForOwner)
})

describe("reconcileUserSelfUsage", () => {
  test("assigns counts directly (not GREATEST) via onConflictDoUpdate", async () => {
    await userQuotaService.reconcileUserSelfUsage("user-1")

    const call = dbInsert.mock.results.find((r) => r.value)?.value as {
      onConflictDoUpdate: ReturnType<typeof vi.fn>
    }
    expect(call.onConflictDoUpdate).toHaveBeenCalled()
    const arg = call.onConflictDoUpdate.mock.calls[0]?.[0] as {
      set: Record<string, unknown>
    }
    // Assigned directly as plain numbers, never a GREATEST(...) sql fragment.
    expect(typeof arg.set.contactsUsed).toBe("number")
    expect(typeof arg.set.teamMembersUsed).toBe("number")
    expect(typeof arg.set.workspacesUsed).toBe("number")
    expect(typeof arg.set.channelsUsed).toBe("number")
  })

  // Relocated from apps/worker/__tests__/sync-user-quota-reconcile.test.ts,
  // which can no longer see the upsert now that it mocks the service.
  test("writes the recomputed count even when LOWER than the stored value (deletions free slots)", async () => {
    // Source-of-truth counts after deletions: [contacts, workspaces, channels].
    countResults.push(3, 2, 4)
    countDistinctTeamMembersForOwner.mockResolvedValue(1)
    // The stored row previously held higher (high-water) values.
    findFirstUserQuota.mockResolvedValue({
      macUsed: 0,
      periodStart: null,
      periodEnd: null,
      monthlyBotMessagesPeriodStart: null,
    })

    await userQuotaService.reconcileUserSelfUsage("user-1")

    const call = dbInsert.mock.results.find((r) => r.value)?.value as {
      onConflictDoUpdate: ReturnType<typeof vi.fn>
    }
    const arg = call.onConflictDoUpdate.mock.calls[0]?.[0] as {
      set: Record<string, unknown>
    }
    expect(arg.set.contactsUsed).toBe(3)
    expect(arg.set.teamMembersUsed).toBe(1)
    expect(arg.set.workspacesUsed).toBe(2)
    expect(arg.set.channelsUsed).toBe(4)

    // The live Redis counter mirrors the current count, not the stale values.
    expect(hset.mock.calls[0]).toEqual([
      expect.any(String),
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

  test("counts a human shared across workspaces once", async () => {
    // Two workspaces with the owner and one shared teammate produce four
    // membership rows but only two distinct people.
    countResults.push(0, 2, 0)
    countDistinctTeamMembersForOwner.mockResolvedValue(2)

    await userQuotaService.reconcileUserSelfUsage("user-1")

    expect(countDistinctTeamMembersForOwner).toHaveBeenCalledWith("user-1")
    const call = dbInsert.mock.results.find((r) => r.value)?.value as {
      onConflictDoUpdate: ReturnType<typeof vi.fn>
    }
    const arg = call.onConflictDoUpdate.mock.calls[0]?.[0] as {
      set: Record<string, unknown>
    }
    expect(arg.set.teamMembersUsed).toBe(2)
  })

  test("writes increases too (count grew since last sync)", async () => {
    countResults.push(42, 3, 5)
    countDistinctTeamMembersForOwner.mockResolvedValue(7)

    await userQuotaService.reconcileUserSelfUsage("user-2")

    const call = dbInsert.mock.results.find((r) => r.value)?.value as {
      onConflictDoUpdate: ReturnType<typeof vi.fn>
    }
    const arg = call.onConflictDoUpdate.mock.calls[0]?.[0] as {
      set: Record<string, unknown>
    }
    expect(arg.set.contactsUsed).toBe(42)
    expect(arg.set.teamMembersUsed).toBe(7)
    expect(arg.set.workspacesUsed).toBe(3)
    expect(arg.set.channelsUsed).toBe(5)
  })

  test("hset field list has no `mac` field on the self-reconcile path", async () => {
    await userQuotaService.reconcileUserSelfUsage("user-1")

    const hsetArgs = hset.mock.calls[0] as unknown[]
    const fields = hsetArgs.slice(1).filter((_, i) => i % 2 === 0)
    expect(fields).toEqual([
      "contacts",
      "teamMembers",
      "workspaces",
      "channels",
    ])
    expect(fields).not.toContain("mac")
  })

  test("returns the four markers from one round-trip read-back", async () => {
    const result = await userQuotaService.reconcileUserSelfUsage("user-1")

    expect(result).toEqual({
      macUsed: 10,
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-02-01T00:00:00Z"),
      monthlyBotMessagesPeriodStart: new Date("2026-01-01T00:00:00Z"),
    })
  })

  test("returns zeroed/null markers when no quota row exists yet", async () => {
    findFirstUserQuota.mockResolvedValue(undefined)

    const result = await userQuotaService.reconcileUserSelfUsage("user-1")

    expect(result).toEqual({
      macUsed: 0,
      periodStart: null,
      periodEnd: null,
      monthlyBotMessagesPeriodStart: null,
    })
  })
})

describe("persistMacUsed", () => {
  test("upserts macUsed to the given absolute value via onConflictDoUpdate", async () => {
    await userQuotaService.persistMacUsed("user-1", 42)

    const call = dbInsert.mock.results.at(-1)?.value as {
      values: ReturnType<typeof vi.fn>
      onConflictDoUpdate: ReturnType<typeof vi.fn>
    }
    expect(call.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", macUsed: 42 }),
    )
    expect(call.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ macUsed: 42 }),
      }),
    )
  })
})

describe("applyMonthlyBotMessagesReset", () => {
  test("reset branch zeroes monthlyBotMessagesUsed and stamps the period", async () => {
    await userQuotaService.applyMonthlyBotMessagesReset({
      userId: "user-1",
      periodStart: new Date("2026-02-01T00:00:00Z"),
      reset: true,
    })

    const call = dbInsert.mock.results.at(-1)?.value as {
      values: ReturnType<typeof vi.fn>
    }
    expect(call.values).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyBotMessagesUsed: 0 }),
    )
  })

  test("non-reset branch stamps only, without touching the counter", async () => {
    await userQuotaService.applyMonthlyBotMessagesReset({
      userId: "user-1",
      periodStart: new Date("2026-02-01T00:00:00Z"),
      reset: false,
    })

    const call = dbInsert.mock.results.at(-1)?.value as {
      values: ReturnType<typeof vi.fn>
    }
    const valuesArg = call.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(valuesArg).not.toHaveProperty("monthlyBotMessagesUsed")
    expect(valuesArg.monthlyBotMessagesPeriodStart).toEqual(
      new Date("2026-02-01T00:00:00Z"),
    )
  })
})
