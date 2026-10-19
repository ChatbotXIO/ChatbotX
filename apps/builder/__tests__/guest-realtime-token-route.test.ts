// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
  checkApiRateLimit: vi.fn(),
  checkGuestRateLimit: vi.fn(),
  integrationWebchatServiceFindByIdForWorkspaceOrNull: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn(),
  loggerError: vi.fn(),
  resolveBroadcastSecret: vi.fn(),
  serverErrorHandler: vi.fn(),
  signGuestConnectToken: vi.fn(),
  verifyWebchatAccessToken: vi.fn(),
  workspaceServiceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWebchatService: {
    findByIdForWorkspaceOrNull:
      mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull,
  },
  isWorkspaceScheduledForDeletion: mocks.isWorkspaceScheduledForDeletion,
  resolveBroadcastSecret: mocks.resolveBroadcastSecret,
  workspaceService: { find: mocks.workspaceServiceFind },
}))

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  extractBearerToken: (header: string | null) =>
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null,
  signGuestConnectToken: mocks.signGuestConnectToken,
}))

vi.mock("@/features/integration-webchat/lib/webchat-access-token", () => ({
  verifyWebchatAccessToken: mocks.verifyWebchatAccessToken,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit: mocks.checkGuestRateLimit,
  getGuestClientIp: () => "203.0.113.1",
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}))
vi.mock("@/lib/domain", () => ({
  getDomainFromHeader: () => "builder.test",
}))
vi.mock("@/lib/errors/server-handler", () => ({
  serverErrorHandler: mocks.serverErrorHandler,
}))
vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError },
}))

// Dynamic import required: the route module must load after the vi.mock
// calls above are registered, so its `@chatbotx.io/business` /
// `@chatbotx.io/realtime-protocol` imports resolve to the mocks instead of
// the real modules (matches apps/builder/__tests__/media-proxy-route.test.ts).
const { POST } = await import("@/app/api/guest/realtime-token/route")

const WORKSPACE_ID = "12345"
const WEBCHAT_ID = "67890"
const LEGACY_GUEST_CONVERSATION_ID = "999000111"
const NEW_GUEST_CONVERSATION_ID = `${WORKSPACE_ID}:3f6a2f2a-1b1a-4e9a-9b1a-7c3a2f2a1b1a`

const webchat = (overrides: Record<string, unknown> = {}) => ({
  authorizedDomains: [] as string[],
  ...overrides,
})

const buildRequest = (
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  new NextRequest("https://builder.test/api/guest/realtime-token", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })

const baseBody = (overrides: Record<string, unknown> = {}) => ({
  guestConversationId: NEW_GUEST_CONVERSATION_ID,
  parentOrigin: "https://example.com",
  workspaceId: WORKSPACE_ID,
  webchatId: WEBCHAT_ID,
  ...overrides,
})

describe("POST /api/guest/realtime-token", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkGuestRateLimit.mockResolvedValue({
      limited: false,
      retryAfter: 0,
    })
    mocks.checkApiRateLimit.mockResolvedValue({
      limited: false,
      retryAfter: 0,
    })
    mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull.mockResolvedValue(
      webchat(),
    )
    mocks.verifyWebchatAccessToken.mockResolvedValue({ authorized: true })
    mocks.isWorkspaceScheduledForDeletion.mockReturnValue(false)
    mocks.workspaceServiceFind.mockResolvedValue(null)
    mocks.resolveBroadcastSecret.mockReturnValue("broadcast-secret")
    mocks.signGuestConnectToken.mockResolvedValue("signed-guest-token")
    mocks.serverErrorHandler.mockReturnValue(
      new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
      }),
    )
  })

  test("returns 429 with Retry-After when rate limited by IP, without looking up the webchat", async () => {
    mocks.checkGuestRateLimit.mockResolvedValue({
      limited: true,
      retryAfter: 42,
    })

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("42")
    expect(
      mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull,
    ).not.toHaveBeenCalled()
  })
  test("returns 404 when the webchat cannot be found for the workspace", async () => {
    mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull.mockResolvedValue(
      undefined,
    )

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(404)
  })

  test("returns 400 for a new-format guest conversation id with a mismatched workspace prefix", async () => {
    const response = await POST(
      buildRequest(
        baseBody({
          guestConversationId: "99999:3f6a2f2a-1b1a-4e9a-9b1a-7c3a2f2a1b1a",
        }),
      ),
    )

    expect(response.status).toBe(400)
  })

  test("accepts a legacy digits-only guest conversation id after webchat authorization", async () => {
    const response = await POST(
      buildRequest(
        baseBody({ guestConversationId: LEGACY_GUEST_CONVERSATION_ID }),
      ),
    )

    expect(response.status).toBe(200)
    expect(mocks.signGuestConnectToken).toHaveBeenCalledWith(
      {
        guestConversationId: LEGACY_GUEST_CONVERSATION_ID,
        workspaceId: WORKSPACE_ID,
      },
      "broadcast-secret",
    )
  })

  test("returns 403 without ever checking the workspace-wide mint rate limit when the access token is unauthorized", async () => {
    mocks.verifyWebchatAccessToken.mockResolvedValue({ authorized: false })

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(403)
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled()
  })

  test("returns 403 without ever checking the workspace-wide mint rate limit when the origin is not in the webchat's authorized domains", async () => {
    mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull.mockResolvedValue(
      webchat({ authorizedDomains: ["allowed.example"] }),
    )

    const response = await POST(
      buildRequest(baseBody({ parentOrigin: "https://attacker.test" })),
    )

    expect(response.status).toBe(403)
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled()
  })

  test("accepts the first-party origin even when the webchat has an allowlist", async () => {
    mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull.mockResolvedValue(
      webchat({ authorizedDomains: ["allowed.example"] }),
    )

    const response = await POST(
      buildRequest(baseBody({ parentOrigin: "https://builder.test" })),
    )

    expect(response.status).toBe(200)
  })

  test("returns 200 with a token for an authorized request within all rate limits", async () => {
    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({ token: "signed-guest-token" })
    expect(mocks.checkApiRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "guest-realtime-mint-workspace-rate-limit",
        key: WORKSPACE_ID,
      }),
    )
  })

  test("returns 429 with Retry-After when the workspace-wide mint rate limit is exceeded for an otherwise-authorized request", async () => {
    mocks.checkApiRateLimit.mockResolvedValue({
      limited: true,
      retryAfter: 7,
    })

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("7")
    expect(mocks.verifyWebchatAccessToken).toHaveBeenCalled()
    expect(mocks.signGuestConnectToken).not.toHaveBeenCalled()
  })
  test("returns 403 when the workspace is scheduled for deletion", async () => {
    mocks.workspaceServiceFind.mockResolvedValue({ id: WORKSPACE_ID })
    mocks.isWorkspaceScheduledForDeletion.mockReturnValue(true)

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(403)
    expect(mocks.signGuestConnectToken).not.toHaveBeenCalled()
  })

  test("returns 503 without an error body when workspace lookup fails", async () => {
    const error = new Error("db down")
    mocks.workspaceServiceFind.mockRejectedValue(error)

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(503)
    await expect(response.text()).resolves.toBe("")
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: error, workspaceId: WORKSPACE_ID },
      "Failed to issue guest realtime token",
    )
    expect(mocks.serverErrorHandler).not.toHaveBeenCalled()
  })

  test("returns 503 without an error body when signing secret resolution fails", async () => {
    const error = new Error("secret unavailable")
    mocks.resolveBroadcastSecret.mockImplementation(() => {
      throw error
    })

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(503)
    await expect(response.text()).resolves.toBe("")
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: error, workspaceId: WORKSPACE_ID },
      "Failed to issue guest realtime token",
    )
  })

  test.each([
    new ChatbotXException("Known error", "knownError", 400),
    new z.ZodError([]),
  ])("delegates expected errors to the server error handler", async (error) => {
    mocks.workspaceServiceFind.mockRejectedValue(error)

    const response = await POST(buildRequest(baseBody()))

    expect(mocks.serverErrorHandler).toHaveBeenCalledWith(error)
    expect(response.status).toBe(500)
  })
})
