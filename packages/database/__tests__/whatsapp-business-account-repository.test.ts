import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [strings, values],
  })),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {},
  eq: mocks.eq,
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  whatsappBusinessAccountModel: {
    workspaceId: "workspaceId",
    wabaId: "wabaId",
    businessId: "businessId",
    credential: "credential",
    grantedScopes: "grantedScopes",
    scopeCheckedAt: "scopeCheckedAt",
    revision: "revision",
    updatedAt: "updatedAt",
  },
}))

const { WhatsappBusinessAccountRepository } = await import(
  "../src/repositories/whatsapp-business-account/repository"
)

const credential = {
  v: 1 as const,
  iv: "a".repeat(24),
  text: "cipher",
  tag: "b".repeat(32),
}

describe("WhatsappBusinessAccountRepository", () => {
  beforeEach(() => vi.clearAllMocks())

  test("upsertCredential returns the inserted or current-revision row", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "waba-row", revision: 1 }])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    const repository = new WhatsappBusinessAccountRepository()

    await expect(
      repository.upsertCredential({
        workspaceId: "ws-1",
        wabaId: "waba-1",
        businessId: "business-1",
        credential,
        grantedScopes: ["whatsapp_business_management"],
        scopeCheckedAt: new Date("2026-09-08T00:00:00.000Z"),
        expectedRevision: 0,
        tx: { insert } as never,
      }),
    ).resolves.toEqual({ id: "waba-row", revision: 1 })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, credential }),
    )
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["workspaceId", "wabaId"],
        setWhere: { eq: ["revision", 0] },
      }),
    )
  })

  test("upsertCredential exposes a stale revision without overwriting", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    const repository = new WhatsappBusinessAccountRepository()

    await expect(
      repository.upsertCredential({
        workspaceId: "ws-1",
        wabaId: "waba-1",
        businessId: "business-stale",
        credential,
        grantedScopes: [],
        scopeCheckedAt: new Date(),
        expectedRevision: 1,
        tx: { insert } as never,
      }),
    ).resolves.toBeNull()

    expect(returning).toHaveBeenCalledOnce()
  })

  test("updateScopeCache updates only its expected revision", async () => {
    const returning = vi.fn().mockResolvedValue([{ revision: 3 }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new WhatsappBusinessAccountRepository()

    await expect(
      repository.updateScopeCache({
        workspaceId: "ws-1",
        wabaId: "waba-1",
        grantedScopes: ["whatsapp_business_messaging"],
        scopeCheckedAt: new Date("2026-09-08T00:00:00.000Z"),
        expectedRevision: 2,
        tx: { update } as never,
      }),
    ).resolves.toEqual({ revision: 3 })

    expect(mocks.eq).toHaveBeenCalledWith("revision", 2)
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId", "ws-1")
    expect(mocks.eq).toHaveBeenCalledWith("wabaId", "waba-1")
  })
})
