import { beforeEach, describe, expect, test, vi } from "vitest"

const execute = vi.fn()
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({ execute }),
)
const deactivateOwnerWorkspaces = vi.fn()
const update = vi.fn(() => ({
  set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
}))
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const error = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workspaceLifecycleService: { deactivateOwnerWorkspaces },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction, update },
  eq: (left: unknown, right: unknown) => ({ left, right }),
  sql: (parts: TemplateStringsArray) => parts.join("?"),
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  planStatuses: { enum: { trial: "trial" } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  userQuotaModel: { userId: "userId" },
}))
vi.mock("@chatbotx.io/redis", () => ({ distributedLock: { runExclusive } }))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ error }),
}))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: ["integration"],
}))

const { unsubscribeExpiredTrials } = await import(
  "../src/schedule/handlers/unsubscribe-expired-trials"
)

beforeEach(() => {
  execute.mockReset()
  transaction.mockClear()
  deactivateOwnerWorkspaces.mockReset()
  update.mockClear()
  runExclusive.mockClear()
  error.mockReset()
  execute.mockResolvedValue({ rows: [] })
  deactivateOwnerWorkspaces.mockResolvedValue(undefined)
})

describe("unsubscribeExpiredTrials", () => {
  test("claims due owners under a lock and tears down channels idempotently", async () => {
    execute.mockResolvedValueOnce({ rows: [{ userId: "owner-1" }] })

    await unsubscribeExpiredTrials()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:unsubscribe-expired-trials",
        timeoutInSeconds: 55,
      }),
    )
    expect(deactivateOwnerWorkspaces).toHaveBeenCalledWith({
      ownerId: "owner-1",
      integrations: ["integration"],
      teardownLevel: "disconnect",
    })
    expect(update).toHaveBeenCalledTimes(1)
  })

  test("isolates teardown errors per owner", async () => {
    execute.mockResolvedValueOnce({
      rows: [{ userId: "owner-1" }, { userId: "owner-2" }],
    })
    deactivateOwnerWorkspaces.mockRejectedValueOnce(new Error("failed"))

    await unsubscribeExpiredTrials()

    expect(error).toHaveBeenCalledOnce()
    expect(deactivateOwnerWorkspaces).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
