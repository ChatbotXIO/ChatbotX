import { beforeEach, describe, expect, test, vi } from "vitest"

// Re-activating a disconnected inbox (same page connected again) must make its
// parked or failed post sync due again, inside the transaction of the status
// write. A brand-new or already connected inbox must not touch it.

const mocks = vi.hoisted(() => ({
  resetAfterAuthChange: vi.fn(),
  releaseParkedForInbox: vi.fn(),
  tryConsume: vi.fn(),
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
  quotaEnforcementService: { tryConsume: mocks.tryConsume },
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
  mocks.increment.mockResolvedValue(true)
  mocks.resetAfterAuthChange.mockResolvedValue(true)
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
})
