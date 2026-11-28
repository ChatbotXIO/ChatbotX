import { beforeEach, describe, expect, test, vi } from "vitest"

// Re-activating a disconnected inbox (same page connected again) must make its
// parked or failed post sync due again, inside the transaction of the status
// write. A brand-new or already connected inbox must not touch it.

const mocks = vi.hoisted(() => ({
  resetAfterAuthChange: vi.fn(),
  releaseParkedForInbox: vi.fn(),
  tryConsume: vi.fn(),
  release: vi.fn(),
  increment: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importActual) => ({
  ...(await importActual<object>()),
  channelPostSyncRepository: {
    resetAfterAuthChange: mocks.resetAfterAuthChange,
    releaseParkedForInbox: mocks.releaseParkedForInbox,
  },
}))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    tryConsume: mocks.tryConsume,
    release: mocks.release,
  },
}))
vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { increment: mocks.increment },
}))

const findFirst = vi.fn()
const returning = vi.fn()
const where = vi.fn(() => ({ returning }))
const set = vi.fn(() => ({ where }))
const tx = {
  query: { inboxModel: { findFirst } },
  update: vi.fn(() => ({ set })),
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning })) })),
}

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  db: tx,
}))

const { inboxService } = await import("../src/inbox/service")

const data = {
  workspaceId: "ws-1",
  channel: "messenger",
  sourceId: "page-1",
  name: "Test2",
} as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tryConsume.mockResolvedValue({ ok: true })
  mocks.release.mockResolvedValue(undefined)
  mocks.increment.mockResolvedValue(true)
  mocks.resetAfterAuthChange.mockResolvedValue(true)
  where.mockImplementation(() => ({ returning }))
})

describe("inboxService.create", () => {
  test("re-activating a disconnected inbox resets its post sync on the same tx", async () => {
    findFirst.mockResolvedValue({ id: "inbox-1", status: "disconnected" })
    returning.mockResolvedValue([{ id: "inbox-1", status: "connected" }])

    await inboxService.create({ data, ownerId: "owner-1", tx: tx as never })

    expect(mocks.resetAfterAuthChange).toHaveBeenCalledExactlyOnceWith(
      { inboxId: "inbox-1", workspaceId: "ws-1", now: expect.any(Date) },
      tx,
    )
  })

  test("an already connected inbox leaves its post sync alone", async () => {
    findFirst.mockResolvedValue({ id: "inbox-1", status: "connected" })

    await inboxService.create({ data, ownerId: "owner-1", tx: tx as never })

    expect(mocks.resetAfterAuthChange).not.toHaveBeenCalled()
  })
})

describe("inboxService.resumeTenantSuspended", () => {
  test("only releases a notConnected row; a failed auth row is left to the scanner", async () => {
    await inboxService.resumeTenantSuspended({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(mocks.resetAfterAuthChange).not.toHaveBeenCalled()
    expect(mocks.releaseParkedForInbox).toHaveBeenCalledExactlyOnceWith(
      { inboxId: "inbox-1", workspaceId: "ws-1", now: expect.any(Date) },
      tx,
    )
  })

  test("writes the workspace usage row on the caller's transaction so a rollback undoes it", async () => {
    await inboxService.resumeTenantSuspended({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(mocks.increment).toHaveBeenCalledExactlyOnceWith(
      "ws-1",
      "channels",
      1,
      tx,
    )
  })

  test("gives the quota unit back and rethrows when the usage write fails on the caller's transaction", async () => {
    const usageError = new Error("usage upsert failed")
    mocks.increment.mockRejectedValueOnce(usageError)

    await expect(
      inboxService.resumeTenantSuspended({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        ownerId: "owner-1",
        tx: tx as never,
      }),
    ).rejects.toBe(usageError)

    expect(mocks.release).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      metric: "channels",
    })
  })

  test("gives the quota unit back when the inbox update fails, without touching usage", async () => {
    const updateError = new Error("update failed")
    where.mockImplementationOnce(() => {
      throw updateError
    })

    await expect(
      inboxService.resumeTenantSuspended({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        ownerId: "owner-1",
        tx: tx as never,
      }),
    ).rejects.toBe(updateError)

    expect(mocks.release).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.increment).not.toHaveBeenCalled()
  })

  test("without a caller transaction, a usage failure is best-effort and keeps the consumed unit", async () => {
    mocks.increment.mockRejectedValueOnce(new Error("usage upsert failed"))

    await inboxService.resumeTenantSuspended({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
    })

    expect(mocks.increment).toHaveBeenCalledExactlyOnceWith("ws-1", "channels")
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("does not resume when the channel limit is reached", async () => {
    mocks.tryConsume.mockResolvedValueOnce({ ok: false, level: "pool" })

    await expect(
      inboxService.resumeTenantSuspended({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        ownerId: "owner-1",
        tx: tx as never,
      }),
    ).rejects.toMatchObject({ code: expect.anything() })

    expect(tx.update).not.toHaveBeenCalled()
    expect(mocks.increment).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })
})
