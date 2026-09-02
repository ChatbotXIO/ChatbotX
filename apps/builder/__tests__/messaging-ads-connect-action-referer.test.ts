// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { connectMessagingAdsAction } from "../src/features/ads-campaign/actions/connect.action"
import { buildMessagingAdsToolPath } from "../src/features/ads-campaign/lib/tool-path"

type MessagingAdChannel = "whatsapp" | "messenger" | "instagram"

type ConnectHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
  parsedInput: { channel: MessagingAdChannel }
  ctx: { user: unknown; workspace: unknown }
}) => Promise<unknown>

const { mockAssertWorkspaceSuperAdmin, mockBuildMessagingAdsConnectRedirect } =
  vi.hoisted(() => ({
    mockAssertWorkspaceSuperAdmin: vi.fn(),
    mockBuildMessagingAdsConnectRedirect: vi.fn(),
  }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: ConnectHandler) => handler
  return {
    workspaceActionClient: chain,
    workspaceActionClientAllowExpired: chain,
  }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mockAssertWorkspaceSuperAdmin,
}))

vi.mock("../src/features/ads-campaign/actions/connect-redirect", () => ({
  buildMessagingAdsConnectRedirect: mockBuildMessagingAdsConnectRedirect,
}))

const call = <T>(action: unknown) => action as T

const fakeWorkspace = { id: "ws_1", name: "Test workspace" }
const fakeCtx = { user: { id: "user_1" }, workspace: fakeWorkspace }

describe("connectMessagingAdsAction referer", () => {
  beforeEach(() => {
    mockAssertWorkspaceSuperAdmin.mockResolvedValue(undefined)
    mockBuildMessagingAdsConnectRedirect.mockResolvedValue(undefined)
  })

  test.each([
    "whatsapp",
    "messenger",
    "instagram",
  ] as const)("builds the referer via buildMessagingAdsToolPath for channel=%s", async (channel) => {
    await call<ConnectHandler>(connectMessagingAdsAction)({
      bindArgsParsedInputs: ["ws_1", "integration_1"],
      parsedInput: { channel },
      ctx: fakeCtx,
    })

    const expectedRefererPath = buildMessagingAdsToolPath({
      workspaceId: "ws_1",
      channel,
      integrationId: "integration_1",
    })

    expect(mockBuildMessagingAdsConnectRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: fakeWorkspace,
        channel,
        integrationId: "integration_1",
        refererPath: expectedRefererPath,
      }),
    )
  })

  test("asserts super-admin with the bound workspaceId before redirecting", async () => {
    await call<ConnectHandler>(connectMessagingAdsAction)({
      bindArgsParsedInputs: ["ws_1", "integration_1"],
      parsedInput: { channel: "whatsapp" },
      ctx: fakeCtx,
    })

    expect(mockAssertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws_1")
  })

  test("a rejection from assertWorkspaceSuperAdmin blocks the redirect", async () => {
    const authError = new Error("not a super admin")
    mockAssertWorkspaceSuperAdmin.mockRejectedValueOnce(authError)

    await expect(
      call<ConnectHandler>(connectMessagingAdsAction)({
        bindArgsParsedInputs: ["ws_1", "integration_1"],
        parsedInput: { channel: "whatsapp" },
        ctx: fakeCtx,
      }),
    ).rejects.toThrow("not a super admin")

    expect(mockBuildMessagingAdsConnectRedirect).not.toHaveBeenCalled()
  })
})
