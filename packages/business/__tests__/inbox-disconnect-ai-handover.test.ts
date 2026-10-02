import { beforeEach, describe, expect, test, vi } from "vitest"

// Disconnecting a Page, whatever its channel, must stop its live AI hand-over
// bulk run in the same transaction, and never fail because of the hand-over.

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  decrement: vi.fn(),
  lockExisting: vi.fn(),
  cancelLive: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importActual) => ({
  ...(await importActual<object>()),
  aiHandoverSettingsRepository: { lockExisting: mocks.lockExisting },
  aiHandoverBulkRunRepository: { cancelLive: mocks.cancelLive },
}))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: { release: mocks.release },
}))
vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { decrement: mocks.decrement },
}))

const whereMock = vi.fn()
const setMock = vi.fn(() => ({ where: whereMock }))
const tx = { update: vi.fn(() => ({ set: setMock })) }

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  db: tx,
}))

const { inboxService } = await import("../src/inbox/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.release.mockResolvedValue(undefined)
  mocks.decrement.mockResolvedValue(undefined)
  mocks.lockExisting.mockResolvedValue(null)
  mocks.cancelLive.mockResolvedValue(undefined)
})

describe("inboxService.disconnect", () => {
  const disconnect = () =>
    inboxService.disconnect({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "ws-1",
      reason: "manual",
    })

  test("stops the Page's live bulk run when it has settings, whatever its channel", async () => {
    mocks.lockExisting.mockResolvedValue({ id: "settings-1" })

    await disconnect()

    expect(mocks.cancelLive).toHaveBeenCalledExactlyOnceWith(
      { workspaceId: "ws-1", inboxId: "inbox-1" },
      tx,
    )
  })

  test("leaves runs alone for a Page that never configured the hand-over", async () => {
    await disconnect()

    expect(mocks.cancelLive).not.toHaveBeenCalled()
  })
})
