// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const { findByIdMock, readControlMock, issueCredentialsMock } = vi.hoisted(
  () => ({
    findByIdMock: vi.fn(),
    readControlMock: vi.fn(),
    issueCredentialsMock: vi.fn(),
  }),
)

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

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
  whatsappVoipCallService: { readControl: readControlMock },
  voipTurnCredentialService: { issueCredentials: issueCredentialsMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: { findById: findByIdMock },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { getWhatsappVoipTurnCredentialsAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/voip-turn-credentials.action"
)
const action = getWhatsappVoipTurnCredentialsAction as unknown as ActionHandler

const call = (userId = "agent-1", whatsappCallId = "call-1") =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { whatsappCallId },
    ctx: { user: { id: userId } },
  })

describe("getWhatsappVoipTurnCredentialsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedEnv.TURN_URL = "turn:turn.example.com"
    mockedEnv.TURN_STATIC_SECRET = "turn-secret"
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    // Ring-all default: the call is still UNCLAIMED while agents fetch ICE.
    readControlMock.mockResolvedValue({
      reservedUserId: "",
      phase: "reserved",
    })
    issueCredentialsMock.mockResolvedValue({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:turn.example.com", username: "u", credential: "c" },
      ],
      turnConfigured: true,
    })
  })

  test("denies a cross-workspace call id", async () => {
    findByIdMock.mockResolvedValue({
      id: "call-1",
      workspaceId: "other-workspace",
      inboxId: "inbox-1",
      wacid: "wacid-1",
    })
    await expect(call()).rejects.toThrow("whatsapp.calls.errors.callNotFound")
  })

  test("denies a user once the call has been claimed by someone else (lost racer)", async () => {
    readControlMock.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "answering",
    })

    await expect(call("someone-else")).rejects.toThrow(
      "whatsapp.calls.errors.voipNotReservedAgent",
    )
    expect(issueCredentialsMock).not.toHaveBeenCalled()
  })

  test("denies when there is no live call control", async () => {
    readControlMock.mockResolvedValue(null)

    await expect(call()).rejects.toThrow(
      "whatsapp.calls.errors.voipNotReservedAgent",
    )
    expect(issueCredentialsMock).not.toHaveBeenCalled()
  })

  test("allows any rung agent while the call is still unclaimed (ring-all)", async () => {
    // Default control is unclaimed; a not-yet-winner still gets ICE to prepare.
    await expect(call("agent-2")).resolves.toBeDefined()
    expect(issueCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "agent-2", wacid: "wacid-1" }),
    )
  })

  test("allows the agent who has already claimed the call", async () => {
    readControlMock.mockResolvedValue({
      reservedUserId: "agent-1",
      phase: "answering",
    })

    await expect(call("agent-1")).resolves.toBeDefined()
  })

  test("issues credentials scoped to the caller and the call", async () => {
    const result = await call()

    expect(issueCredentialsMock).toHaveBeenCalledWith({
      userId: "agent-1",
      wacid: "wacid-1",
      turnUrl: "turn:turn.example.com",
      turnStaticSecret: "turn-secret",
    })
    expect(result).toEqual(expect.objectContaining({ turnConfigured: true }))
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
})
