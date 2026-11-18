// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionArgs = {
  parsedInput: { botToken: string; workspaceId?: string | null }
  ctx: { user: { id: string } }
}

const mocks = vi.hoisted(() => ({
  runAction: vi.fn(),
  connect: vi.fn(),
  recordAuthorization: vi.fn(async () => undefined),
  resolveConnectOwnerId: vi.fn(async () => "owner-1"),
  handler: undefined as ((args: ActionArgs) => Promise<unknown>) | undefined,
}))

vi.mock("@/lib/safe-action", () => {
  const chain = {
    inputSchema: () => chain,
    action: (handler: (args: ActionArgs) => Promise<unknown>) => {
      mocks.handler = handler
      return handler
    },
  }
  return { authActionClient: chain }
})
vi.mock("@chatbotx.io/business", () => ({
  telegramIntegrationService: { connect: mocks.connect },
  userService: { recordConnectionAuthorization: mocks.recordAuthorization },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code = "error"
  },
}))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/features/channel-connect/lib/resolve-connect-owner", () => ({
  resolveConnectOwnerId: mocks.resolveConnectOwnerId,
}))
vi.mock("@/integration", () => ({
  integrations: { telegram: { runAction: mocks.runAction } },
}))
vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))
vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example${path}`,
}))
vi.mock("@/lib/tenant/request-tenant", () => ({
  resolveRequestTenantId: vi.fn(async () => "1"),
}))
vi.mock("../../schema/request", () => ({ connectTelegramRequest: {} }))

await import("../connect.action")

const TOKEN = "123:abc"
const BOT_AUTH = { authType: "secretText", secretText: TOKEN }

const execute = (workspaceId: string | null) =>
  (mocks.handler as (args: ActionArgs) => Promise<unknown>)({
    parsedInput: { botToken: TOKEN, workspaceId },
    ctx: { user: { id: "user-1" } },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runAction.mockResolvedValue({ id: "123", username: "bot" })
  mocks.connect.mockResolvedValue({
    workspaceId: "w-result",
    createdWorkspace: false,
    wasCreated: true,
    integrationId: "int-1",
  })
})

describe("connectTelegramAction — connection authorization capture", () => {
  test("records the validated bot token once, before the bot is stored", async () => {
    await execute("w-1")

    expect(mocks.recordAuthorization).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuthorization).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "telegram",
      auth: BOT_AUTH,
      phase: "credentialsValidated",
      workspaceId: "w-1",
    })
    expect(mocks.recordAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.connect.mock.invocationCallOrder[0] as number,
    )
  })

  test("a new-workspace connect records once, with a null workspace, before connecting", async () => {
    mocks.connect.mockResolvedValue({
      workspaceId: "w-new",
      createdWorkspace: true,
      wasCreated: true,
      integrationId: "int-1",
    })

    await execute(null)

    expect(mocks.recordAuthorization).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        auth: BOT_AUTH,
        workspaceId: null,
      }),
    )
    expect(mocks.recordAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.connect.mock.invocationCallOrder[0] as number,
    )
  })

  test("a new-workspace connect that fails still records once, with a null workspace", async () => {
    mocks.connect.mockRejectedValue(new Error("db down"))

    await expect(execute(null)).rejects.toThrow()

    expect(mocks.recordAuthorization).toHaveBeenCalledTimes(1)
    expect(mocks.recordAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: null }),
    )
  })

  test("records nothing when Telegram rejects the bot token", async () => {
    mocks.runAction.mockRejectedValue(new Error("Unauthorized"))

    await expect(execute("w-1")).rejects.toThrow()

    expect(mocks.recordAuthorization).not.toHaveBeenCalled()
  })
})
