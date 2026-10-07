import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// workspaceUsageService — the display-only per-workspace breakdown mirroring
// UserQuota.*Used. Verifies the `mac` metric write-through added alongside
// `WorkspaceUsage.macUsed`: increment() persists to the real column (not the
// `contacts` placeholder it used before the column existed) and getUsage()
// surfaces it.
// ---------------------------------------------------------------------------

const findFirstUsage = vi.fn(async () => null as unknown)
const insertBuilder = {
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
}
insertBuilder.values.mockReturnValue(insertBuilder)
insertBuilder.onConflictDoUpdate.mockResolvedValue(undefined)

const dbInsert = vi.fn(() => insertBuilder)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: dbInsert,
    query: { workspaceUsageModel: { findFirst: findFirstUsage } },
  },
  eq: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceUsageModel: {
    workspaceId: "workspaceId-column",
    contactsUsed: "contactsUsed-column",
    channelsUsed: "channelsUsed-column",
    teamMembersUsed: "teamMembersUsed-column",
    botMessagesUsed: "botMessagesUsed-column",
    macUsed: "macUsed-column",
  },
}))

const redisClient = {
  hmget: vi.fn(async (..._args: unknown[]) => [] as (string | null)[]),
  hsetnx: vi.fn(async () => 1),
  hget: vi.fn(async () => null as string | null),
  hincrby: vi.fn(async () => 1),
}
const cacheConnections = {
  useExisting: vi.fn(async () => redisClient),
}
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
  cacheConnections,
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { workspaceUsageService } = await import("../src/workspace-usage/service")

const WORKSPACE = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  cacheConnections.useExisting.mockResolvedValue(redisClient)
  findFirstUsage.mockResolvedValue(null)
  redisClient.hget.mockResolvedValue(null)
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.onConflictDoUpdate.mockResolvedValue(undefined)
})

describe("workspaceUsageService.increment (mac)", () => {
  test("write-throughs +1 to the macUsed column via upsert", async () => {
    await workspaceUsageService.increment(WORKSPACE, "mac", 1)

    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        macUsed: 1,
      }),
    )
    const [{ set }] = insertBuilder.onConflictDoUpdate.mock.calls[0]
    expect(set).toHaveProperty("macUsed")
  })

  test("bumps the live redis counter under the mac field", async () => {
    redisClient.hget.mockResolvedValue("5")

    await workspaceUsageService.increment(WORKSPACE, "mac", 2)

    expect(redisClient.hincrby).toHaveBeenCalledWith(
      expect.stringContaining(WORKSPACE),
      "mac",
      2,
    )
  })
})

describe("workspaceUsageService.increment (caller-owned transaction)", () => {
  // Regression: a workspace created earlier in the SAME uncommitted transaction
  // (`integrationWebchatService.createWithWorkspace`) is invisible to a second
  // connection, so writing the WorkspaceUsage row through the global `db` hit
  // `WorkspaceUsage_workspaceId_Workspace_id_fkey`. The durable write must
  // run on the caller's `tx`.
  test("writes the durable row through the supplied tx, never the global db", async () => {
    const txBuilder = {
      values: vi.fn(),
      onConflictDoUpdate: vi.fn(),
    }
    txBuilder.values.mockReturnValue(txBuilder)
    txBuilder.onConflictDoUpdate.mockResolvedValue(undefined)
    const txInsert = vi.fn(() => txBuilder)
    const tx = { insert: txInsert } as never

    await workspaceUsageService.increment(WORKSPACE, "channels", 1, tx)

    expect(txInsert).toHaveBeenCalledTimes(1)
    expect(txBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE, channelsUsed: 1 }),
    )
    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("reports whether the live counter took the increment", async () => {
    await expect(
      workspaceUsageService.increment(WORKSPACE, "channels", 1),
    ).resolves.toBe(true)

    redisClient.hincrby.mockRejectedValueOnce(new Error("redis down"))
    await expect(
      workspaceUsageService.increment(WORKSPACE, "channels", 1),
    ).resolves.toBe(false)
  })

  test("still writes through the global db when no tx is supplied", async () => {
    await workspaceUsageService.increment(WORKSPACE, "channels", 1)

    expect(dbInsert).toHaveBeenCalledTimes(1)
  })
})

describe("workspaceUsageService.getUsage", () => {
  test("surfaces macUsed from the live counters alongside the other metrics", async () => {
    redisClient.hmget.mockResolvedValue(["1", "2", "3", "4", "5"])

    const usage = await workspaceUsageService.getUsage(WORKSPACE)

    expect(usage).toMatchObject({
      contactsUsed: 1,
      channelsUsed: 2,
      teamMembersUsed: 3,
      botMessagesUsed: 4,
      macUsed: 5,
    })
  })

  test("cold-seeds macUsed from the DB row when the live field is missing", async () => {
    findFirstUsage.mockResolvedValue({
      contactsUsed: 10,
      channelsUsed: 20,
      teamMembersUsed: 30,
      botMessagesUsed: 40,
      macUsed: 50,
    })
    // All fields missing (cold start) — every metric falls back to the DB row.
    redisClient.hmget.mockResolvedValue([null, null, null, null, null])

    const usage = await workspaceUsageService.getUsage(WORKSPACE)

    expect(usage.macUsed).toBe(50)
  })
})

describe("workspaceUsageService.upsertReconciled", () => {
  test("upserts onConflictDoUpdate target workspaceId with direct-assign set and CURRENT_TIMESTAMP", async () => {
    await workspaceUsageService.upsertReconciled({
      workspaceId: WORKSPACE,
      contactsUsed: 10,
      channelsUsed: 2,
      teamMembersUsed: 3,
      macUsed: 40,
    })

    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        contactsUsed: 10,
        channelsUsed: 2,
        teamMembersUsed: 3,
        macUsed: 40,
      }),
    )
    const [{ target, set }] = insertBuilder.onConflictDoUpdate.mock.calls[0]
    expect(target).toBe("workspaceId-column")
    expect(set).toMatchObject({
      contactsUsed: 10,
      channelsUsed: 2,
      teamMembersUsed: 3,
      macUsed: 40,
    })
    expect(set).toHaveProperty("updatedAt")
  })
})
