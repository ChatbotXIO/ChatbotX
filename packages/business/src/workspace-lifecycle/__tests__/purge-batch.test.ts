import { beforeEach, describe, expect, test, vi } from "vitest"
import { WorkspacePurgeIncompleteError } from "../../errors"

const { mockExecute, mockTransaction } = vi.hoisted(() => {
  const execute = vi.fn()
  return {
    mockExecute: execute,
    mockTransaction: vi.fn((callback: (tx: unknown) => unknown) =>
      callback({ execute }),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mockTransaction },
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => "") },
  ),
}))
vi.mock("../../logger", () => ({ logger: { info: vi.fn() } }))

const { drainInBatches, withPurgeTimeouts } = await import("../purge-batch")

const props = {
  batchSize: 2,
  deadlineAt: Date.now() + 60_000,
  maxBatches: 2,
  table: "Example",
  workspaceId: "workspace-1",
}

describe("purge batch helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
  })

  test("throws incomplete before starting a batch when the deadline has elapsed", async () => {
    await expect(
      drainInBatches({
        ...props,
        deadlineAt: Date.now(),
        runBatch: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(WorkspacePurgeIncompleteError)
  })

  test("throws incomplete when every permitted batch is full", async () => {
    await expect(
      drainInBatches({
        ...props,
        runBatch: async () => ({ count: 2, value: undefined }),
      }),
    ).rejects.toBeInstanceOf(WorkspacePurgeIncompleteError)
  })

  test.each([
    "55P03",
    "57014",
  ])("maps PostgreSQL %s timeout errors to incomplete", async (code) => {
    mockTransaction.mockRejectedValueOnce({ code })

    await expect(
      withPurgeTimeouts({
        fn: async () => undefined,
        table: "Example",
        workspaceId: "workspace-1",
      }),
    ).rejects.toBeInstanceOf(WorkspacePurgeIncompleteError)
  })

  test("rethrows non-timeout failures", async () => {
    const error = new Error("database unavailable")
    mockTransaction.mockRejectedValueOnce(error)

    await expect(
      withPurgeTimeouts({
        fn: async () => undefined,
        table: "Example",
        workspaceId: "workspace-1",
      }),
    ).rejects.toBe(error)
  })
})
