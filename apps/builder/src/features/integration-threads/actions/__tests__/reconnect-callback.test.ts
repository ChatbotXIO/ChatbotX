// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const findByIdForWorkspace = vi.fn()
const reconnect = vi.fn()
const recordConnectionAuthorization = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  integrationThreadsService: { findByIdForWorkspace, reconnect },
  userService: { recordConnectionAuthorization },
}))

const getThreadsProfile = vi.fn()
const threadsAuth = { authType: "oauth2", tokens: { accessToken: "token" } }

vi.mock("@chatbotx.io/integration-threads", () => ({
  buildThreadsAuthValue: vi.fn(() => threadsAuth),
  getThreadsProfile,
}))

const { reconnectThreadsHandler } = await import("../reconnect-callback")

const WORKSPACE_ID = "100"
const USER_ID = "user-1"

const invoke = () =>
  reconnectThreadsHandler({
    credentialConfig: {
      clientId: "client-id",
      clientSecret: "client-secret",
      version: "v1.0",
    },
    callbackUrl: "https://app.example/callback",
    workspaceId: WORKSPACE_ID,
    integrationId: "200",
    userId: USER_ID,
    accessToken: "token",
  })

beforeEach(() => {
  vi.clearAllMocks()
  findByIdForWorkspace.mockResolvedValue({ id: "200", threadsUserId: "th-1" })
  getThreadsProfile.mockResolvedValue({ id: "th-1", username: "me" })
  reconnect.mockResolvedValue({ id: "200" })
})

describe("reconnectThreadsHandler — connection authorization capture", () => {
  test("records the validated auth once, before the reconnect is stored", async () => {
    const result = await invoke()

    expect(result).toEqual({ status: "success" })
    expect(recordConnectionAuthorization).toHaveBeenCalledTimes(1)
    expect(recordConnectionAuthorization).toHaveBeenCalledWith({
      userId: USER_ID,
      provider: "threads",
      auth: threadsAuth,
      phase: "reconnectValidated",
      workspaceId: WORKSPACE_ID,
    })
    expect(
      recordConnectionAuthorization.mock.invocationCallOrder[0],
    ).toBeLessThan(reconnect.mock.invocationCallOrder[0] as number)
  })

  test("records nothing when the authorized account is not the connected one", async () => {
    getThreadsProfile.mockResolvedValue({ id: "someone-else", username: "x" })

    const result = await invoke()

    expect(result).toEqual({ status: "error", reason: "accountNotFound" })
    expect(recordConnectionAuthorization).not.toHaveBeenCalled()
  })

  test("a failed reconnect after the capture still reports its own failure", async () => {
    reconnect.mockRejectedValue(new Error("boom"))

    const result = await invoke()

    expect(recordConnectionAuthorization).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ status: "error", reason: "failed" })
  })
})
