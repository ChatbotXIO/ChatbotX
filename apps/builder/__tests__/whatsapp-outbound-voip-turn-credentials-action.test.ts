// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { issueCredentialsMock, incrWithWindowMock } = vi.hoisted(() => ({
  issueCredentialsMock: vi.fn(),
  incrWithWindowMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const mockedEnv: { TURN_URL?: string; TURN_STATIC_SECRET?: string } = {
  TURN_URL: "turn:turn.example.com",
  TURN_STATIC_SECRET: "turn-secret",
}
vi.mock("@/env", () => ({
  get env() {
    return mockedEnv
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  voipTurnCredentialService: { issueCredentials: issueCredentialsMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code?: string
    httpStatusCode?: number
    constructor(message: string, code?: string, httpStatusCode?: number) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { incrWithWindow: incrWithWindowMock },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { outboundVoipTurnCredentialsAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/outbound-voip-turn-credentials.action"
)
const action = outboundVoipTurnCredentialsAction as unknown as ActionHandler

const call = (userId = "agent-1", attemptId = "client-attempt-1") =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { attemptId },
    ctx: { user: { id: userId } },
  })

describe("outboundVoipTurnCredentialsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedEnv.TURN_URL = "turn:turn.example.com"
    mockedEnv.TURN_STATIC_SECRET = "turn-secret"
    issueCredentialsMock.mockResolvedValue({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:turn.example.com", username: "u", credential: "c" },
      ],
      turnConfigured: true,
    })
    let counter = 0
    incrWithWindowMock.mockImplementation(() => Promise.resolve(++counter))
  })

  test("requires no call row / wacid — issues credentials from just the caller + a client attempt id", async () => {
    const result = await call("agent-1", "client-attempt-1")

    expect(issueCredentialsMock).toHaveBeenCalledWith({
      userId: "agent-1",
      wacid: "client-attempt-1",
      turnUrl: "turn:turn.example.com",
      turnStaticSecret: "turn-secret",
    })
    expect(result).toEqual(expect.objectContaining({ turnConfigured: true }))
  })

  test("scopes the identifier to both the caller and the attempt", async () => {
    await call("agent-2", "client-attempt-2")
    expect(issueCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "agent-2",
        wacid: "client-attempt-2",
      }),
    )
  })

  test("falls back to STUN-only with a clear indicator when TURN is unconfigured", async () => {
    mockedEnv.TURN_STATIC_SECRET = undefined
    issueCredentialsMock.mockResolvedValue({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      turnConfigured: false,
    })

    const result = await call()

    expect(issueCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnStaticSecret: undefined }),
    )
    expect(result).toEqual(expect.objectContaining({ turnConfigured: false }))
  })

  test("rejects with a rate-limit error once the per-user mint window is exceeded", async () => {
    incrWithWindowMock.mockResolvedValue(11)

    await expect(call("agent-1", "attempt-x")).rejects.toMatchObject({
      code: "tooManyRequests",
      httpStatusCode: 429,
    })
    expect(issueCredentialsMock).not.toHaveBeenCalled()
  })

  test("allows the mint while under the per-user window limit", async () => {
    incrWithWindowMock.mockResolvedValue(1)

    await expect(call("agent-1", "attempt-x")).resolves.toEqual(
      expect.objectContaining({ turnConfigured: true }),
    )
    expect(issueCredentialsMock).toHaveBeenCalled()
  })

  test("rate limit is scoped per user — a different caller is unaffected", async () => {
    incrWithWindowMock.mockImplementation((key: string) =>
      Promise.resolve(key.includes("agent-1") ? 11 : 1),
    )

    await expect(call("agent-1", "attempt-x")).rejects.toMatchObject({
      code: "tooManyRequests",
    })
    await expect(call("agent-2", "attempt-y")).resolves.toEqual(
      expect.objectContaining({ turnConfigured: true }),
    )
  })

  test("fails open (still mints) when the rate-limit store errors", async () => {
    incrWithWindowMock.mockRejectedValue(new Error("redis down"))

    await expect(call()).resolves.toEqual(
      expect.objectContaining({ turnConfigured: true }),
    )
    expect(issueCredentialsMock).toHaveBeenCalled()
  })
})
