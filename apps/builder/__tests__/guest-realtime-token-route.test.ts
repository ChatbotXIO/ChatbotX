// @vitest-environment node

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkGuestRateLimit: vi.fn(),
  contactInboxServiceFindLatestBySource: vi.fn(),
  integrationWebchatServiceFindByIdForWorkspaceOrNull: vi.fn(),
  resolveBroadcastSecret: vi.fn(),
  signGuestConnectToken: vi.fn(),
  verifyWebchatAccessToken: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    findLatestBySource: mocks.contactInboxServiceFindLatestBySource,
  },
  integrationWebchatService: {
    findByIdForWorkspaceOrNull:
      mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull,
  },
  resolveBroadcastSecret: mocks.resolveBroadcastSecret,
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
  inboxId: "inbox-1",
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
  guestConversationId: LEGACY_GUEST_CONVERSATION_ID,
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
    mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull.mockResolvedValue(
      webchat(),
    )
    mocks.contactInboxServiceFindLatestBySource.mockResolvedValue({
      id: "contact-inbox-1",
    })
    mocks.verifyWebchatAccessToken.mockResolvedValue({ authorized: true })
    mocks.resolveBroadcastSecret.mockResolvedValue("broadcast-secret")
    mocks.signGuestConnectToken.mockResolvedValue("signed-guest-token")
  })

  test("returns 429 with Retry-After when rate limited, without touching the database", async () => {
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

  test("returns 400 for a new-format guest conversation id whose workspace prefix mismatches the request, without checking the DB", async () => {
    const response = await POST(
      buildRequest(
        baseBody({
          guestConversationId: "99999:3f6a2f2a-1b1a-4e9a-9b1a-7c3a2f2a1b1a",
        }),
      ),
    )

    expect(response.status).toBe(400)
    expect(mocks.contactInboxServiceFindLatestBySource).not.toHaveBeenCalled()
  })

  test("returns 404 for a legacy digits-only guest conversation id with no matching conversation in this workspace's webchat inbox", async () => {
    mocks.contactInboxServiceFindLatestBySource.mockResolvedValue(undefined)

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(404)
    expect(mocks.contactInboxServiceFindLatestBySource).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceId: LEGACY_GUEST_CONVERSATION_ID,
      workspaceId: WORKSPACE_ID,
    })
  })

  test("proceeds past the ownership check for a legacy id that does resolve a conversation, reaching a 200 with a token", async () => {
    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({ token: "signed-guest-token" })
  })

  test("returns 200 with a token for an authorized new-format guest conversation id", async () => {
    const response = await POST(
      buildRequest(
        baseBody({ guestConversationId: NEW_GUEST_CONVERSATION_ID }),
      ),
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({ token: "signed-guest-token" })
    expect(mocks.contactInboxServiceFindLatestBySource).not.toHaveBeenCalled()
  })

  test("returns 403 when the access token is unauthorized", async () => {
    mocks.verifyWebchatAccessToken.mockResolvedValue({ authorized: false })

    const response = await POST(buildRequest(baseBody()))

    expect(response.status).toBe(403)
  })

  test("returns 403 when the origin is not in the webchat's authorized domains", async () => {
    mocks.integrationWebchatServiceFindByIdForWorkspaceOrNull.mockResolvedValue(
      webchat({ authorizedDomains: ["allowed.example"] }),
    )

    const response = await POST(
      buildRequest(baseBody({ parentOrigin: "https://attacker.test" })),
    )

    expect(response.status).toBe(403)
  })
})
