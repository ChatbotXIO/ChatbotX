import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  blocked: { value: false },
  runJob: vi.fn(async () => ({ enqueued: 0, failed: 0, refreshed: 1 })),
}))

vi.mock("@chatbotx.io/business", () => ({
  reconnectFanOutService: { runJob: mocks.runJob },
  withBlockedOwnerGuard: async (
    _workspaceId: string,
    run: () => Promise<void>,
  ) => {
    if (!mocks.blocked.value) {
      await run()
    }
  },
}))
vi.mock("@chatbotx.io/channel-registry/publish-fan-out-ops", () => ({
  createPublishFanOutOps: () => ({}),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

import { processReconnectPublishFanOut } from "../src/publish-destination/reconnect-fan-out"

const data = { grantedScopes: [], hop: 0, workspaceId: "w1" }

describe("processReconnectPublishFanOut", () => {
  test("runs the fan-out for an active workspace owner", async () => {
    await processReconnectPublishFanOut(
      data as unknown as Parameters<typeof processReconnectPublishFanOut>[0],
    )

    expect(mocks.runJob).toHaveBeenCalledOnce()
  })

  test("does nothing for a blocked workspace owner", async () => {
    mocks.runJob.mockClear()
    mocks.blocked.value = true

    await processReconnectPublishFanOut(
      data as unknown as Parameters<typeof processReconnectPublishFanOut>[0],
    )
    mocks.blocked.value = false

    expect(mocks.runJob).not.toHaveBeenCalled()
  })
})
