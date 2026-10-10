import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * `cancelPendingByProvider` frees a workspace's abandoned OAuth attempts. It
 * must only ever touch `pending` rows of ONE workspace and ONE provider — an
 * `authorized` / `awaiting_selection` row holds a user's in-progress grant.
 * Drizzle builder calls are captured as plain objects (same style as
 * `coexist-sync-run-type-scoping.test.ts`).
 */
const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {},
  desc: vi.fn(),
  eq: mocks.eq,
  gt: vi.fn(),
  inArray: vi.fn(),
  lte: vi.fn(),
  sql: Object.assign(
    vi.fn(() => "now()"),
    { join: vi.fn() },
  ),
}))

vi.mock("../src/schema", () => ({
  connectSessionModel: {
    id: "id",
    workspaceId: "workspaceId",
    provider: "provider",
    status: "status",
  },
}))

const { connectSessionRepository } = await import(
  "../src/repositories/connect-session/repository"
)

const buildTx = () => {
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn(() => chain)
  chain.set = mocks.set.mockReturnValue(chain)
  chain.where = mocks.where.mockReturnValue(chain)
  chain.returning = mocks.returning
  return chain
}

describe("connectSessionRepository.cancelPendingByProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the update to the workspace, the provider and pending only", async () => {
    mocks.returning.mockResolvedValue([{ id: "1" }, { id: "2" }])
    const tx = buildTx()

    const count = await connectSessionRepository.cancelPendingByProvider(
      { workspaceId: "ws-1", provider: "googleAds" },
      tx as never,
    )

    expect(count).toBe(2)
    expect(mocks.where).toHaveBeenCalledWith({
      and: [
        { eq: ["workspaceId", "ws-1"] },
        { eq: ["provider", "googleAds"] },
        { eq: ["status", "pending"] },
      ],
    })
  })

  test("marks rows cancelled, consumed, and clears the ciphertext", async () => {
    mocks.returning.mockResolvedValue([])
    const tx = buildTx()

    const count = await connectSessionRepository.cancelPendingByProvider(
      { workspaceId: "ws-1", provider: "googleAds" },
      tx as never,
    )

    expect(count).toBe(0)
    expect(mocks.set).toHaveBeenCalledWith({
      status: "cancelled",
      consumedAt: "now()",
      encryptedAuth: null,
    })
  })
})
