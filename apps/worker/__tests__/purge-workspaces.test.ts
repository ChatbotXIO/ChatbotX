import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeDueScheduled = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const info = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { purgeDueScheduled },
}))
vi.mock("@chatbotx.io/redis", () => ({ distributedLock: { runExclusive } }))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info }),
}))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: ["integration"],
}))

const { purgeWorkspaces } = await import(
  "../src/schedule/handlers/purge-workspaces"
)

beforeEach(() => {
  purgeDueScheduled.mockReset()
  runExclusive.mockClear()
  info.mockReset()
  purgeDueScheduled.mockResolvedValue(0)
})

describe("purgeWorkspaces", () => {
  test("runs under the distributed lock and passes all integrations", async () => {
    await purgeWorkspaces()
    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:purge-workspaces",
        timeoutInSeconds: 55,
      }),
    )
    expect(purgeDueScheduled).toHaveBeenCalledWith({
      integrations: ["integration"],
    })
  })

  test("logs only when workspaces were deleted", async () => {
    purgeDueScheduled.mockResolvedValue(2)
    await purgeWorkspaces()
    expect(info).toHaveBeenCalledWith(
      { deleted: 2 },
      "purgeWorkspaces: workspaces purged",
    )
  })
})
