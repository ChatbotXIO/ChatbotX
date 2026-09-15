// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByProviderSourceId: vi.fn(),
  connectionServiceDisconnect: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByProviderSourceId: mocks.findByProviderSourceId,
  },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { disconnect: mocks.connectionServiceDisconnect },
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock("@/lib/safe-action", () => {
  const chain = {
    bindArgsSchemas: () => chain,
    action: (
      fn: (props: { bindArgsParsedInputs: [string] }) => Promise<void>,
    ) => fn,
  }
  return { workspaceActionClientAllowExpired: chain }
})

const { createDisconnectAction } = await import("@/lib/integration-actions")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createDisconnectAction", () => {
  test("routes through connectionService.disconnect when a Connection row exists", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({ id: "conn-1" })
    const service = { disconnect: vi.fn() }
    const action = createDisconnectAction(service, {
      name: "ActiveCampaign",
      provider: "activeCampaign",
    }) as unknown as (props: {
      bindArgsParsedInputs: [string]
    }) => Promise<void>

    await action({ bindArgsParsedInputs: ["ws-1"] })

    expect(mocks.findByProviderSourceId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "activeCampaign",
      sourceId: "workspace",
    })
    expect(mocks.connectionServiceDisconnect).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(service.disconnect).not.toHaveBeenCalled()
  })

  test("falls back to the legacy service.disconnect when no Connection row exists yet (pre-backfill)", async () => {
    mocks.findByProviderSourceId.mockResolvedValue(undefined)
    const service = { disconnect: vi.fn() }
    const action = createDisconnectAction(service, {
      name: "ActiveCampaign",
      provider: "activeCampaign",
    }) as unknown as (props: {
      bindArgsParsedInputs: [string]
    }) => Promise<void>

    await action({ bindArgsParsedInputs: ["ws-1"] })

    expect(mocks.connectionServiceDisconnect).not.toHaveBeenCalled()
    expect(service.disconnect).toHaveBeenCalledWith("ws-1")
  })

  test("calls afterDisconnect after either path succeeds", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({ id: "conn-1" })
    const afterDisconnect = vi.fn()
    const action = createDisconnectAction(
      { disconnect: vi.fn() },
      { name: "Claude", provider: "claude", afterDisconnect },
    ) as unknown as (props: { bindArgsParsedInputs: [string] }) => Promise<void>

    await action({ bindArgsParsedInputs: ["ws-1"] })

    expect(afterDisconnect).toHaveBeenCalledWith("ws-1")
  })

  test("logs and rethrows when the underlying disconnect fails", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({ id: "conn-1" })
    mocks.connectionServiceDisconnect.mockRejectedValue(new Error("boom"))
    const action = createDisconnectAction(
      { disconnect: vi.fn() },
      { name: "ActiveCampaign", provider: "activeCampaign" },
    ) as unknown as (props: { bindArgsParsedInputs: [string] }) => Promise<void>

    await expect(action({ bindArgsParsedInputs: ["ws-1"] })).rejects.toThrow(
      "boom",
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
      "Failed to disconnect ActiveCampaign",
    )
  })

  test("suppresses error logging when log: false", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({ id: "conn-1" })
    mocks.connectionServiceDisconnect.mockRejectedValue(new Error("boom"))
    const action = createDisconnectAction(
      { disconnect: vi.fn() },
      { name: "Claude", provider: "claude", log: false },
    ) as unknown as (props: { bindArgsParsedInputs: [string] }) => Promise<void>

    await expect(action({ bindArgsParsedInputs: ["ws-1"] })).rejects.toThrow(
      "boom",
    )
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })
})
