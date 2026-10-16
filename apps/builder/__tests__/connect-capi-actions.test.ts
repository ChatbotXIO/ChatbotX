// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ConnectHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
  ctx: { workspace: unknown }
}) => Promise<unknown>

const { startMetaCapiOAuth } = vi.hoisted(() => ({
  startMetaCapiOAuth: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (handler: ConnectHandler) => handler
  return { workspaceActionClient: chain }
})
vi.mock("@/features/meta-conversions/lib/start-meta-capi-oauth", () => ({
  startMetaCapiOAuth,
}))

const { connectMessengerCapiAction } = await import(
  "@/features/integration-messenger/actions/connect-capi.action"
)
const { connectInstagramCapiAction } = await import(
  "@/features/integration-instagram/actions/connect-capi.action"
)

const workspace = { id: "ws-1" }

beforeEach(() => {
  startMetaCapiOAuth.mockReset().mockResolvedValue(undefined)
})

describe.each([
  ["messenger", connectMessengerCapiAction],
  ["instagram", connectInstagramCapiAction],
] as const)("connect %s CAPI action", (channel, action) => {
  test("starts the OAuth for the bound integration in the caller's workspace", async () => {
    await (action as unknown as ConnectHandler)({
      bindArgsParsedInputs: ["ws-1", "42"],
      ctx: { workspace },
    })

    expect(startMetaCapiOAuth).toHaveBeenCalledWith({
      channel,
      workspace,
      integrationId: "42",
    })
  })

  test("lets a refusal from the starter reach the caller", async () => {
    startMetaCapiOAuth.mockRejectedValueOnce(new Error("superAdminRequired"))

    await expect(
      (action as unknown as ConnectHandler)({
        bindArgsParsedInputs: ["ws-1", "42"],
        ctx: { workspace },
      }),
    ).rejects.toThrow("superAdminRequired")
  })
})
