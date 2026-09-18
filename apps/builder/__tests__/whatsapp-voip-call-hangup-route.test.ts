// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  getCurrentUserId,
  assertCurrentUserCanAccessChatbot,
  endVoipCallAsAgent,
  loggerError,
} = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  assertCurrentUserCanAccessChatbot: vi.fn(),
  endVoipCallAsAgent: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    httpStatusCode = 403
  },
}))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/end-voip-call-as-agent",
  () => ({ endVoipCallAsAgent }),
)

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId,
  assertCurrentUserCanAccessChatbot,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { POST } = await import("../src/app/api/whatsapp-voip-call-hangup/route")

const buildRequest = (body: unknown, headers?: Record<string, string>) =>
  new Request("http://localhost/api/whatsapp-voip-call-hangup", {
    method: "POST",
    body: JSON.stringify(body),
    // Default headers describe a legitimate same-origin request (real
    // browser traffic always carries Host, and `Origin` on a POST) so
    // tests that don't care about the same-site check aren't accidentally
    // exercising its "nothing verifiable" fail-closed branch.
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      origin: "http://localhost",
      ...headers,
    },
  }) as never

describe("POST /api/whatsapp-voip-call-hangup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserId.mockResolvedValue("user-1")
    assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
    endVoipCallAsAgent.mockResolvedValue(true)
  })

  test("rejects an unauthenticated caller", async () => {
    getCurrentUserId.mockResolvedValue(null)

    const response = await POST(
      buildRequest({ workspaceId: "1", whatsappCallId: "1" }),
    )

    expect(response.status).toBe(401)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })

  test("authorized happy path: ends the call via endVoipCallAsAgent", async () => {
    const response = await POST(
      buildRequest({ workspaceId: "1", whatsappCallId: "1" }),
    )

    expect(response.status).toBe(200)
    expect(assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith("1")
    expect(endVoipCallAsAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappCallId: "1",
        workspaceId: "1",
        userId: "user-1",
      }),
    )
  })

  test("rejects a cross-site request", async () => {
    const response = await POST(
      buildRequest(
        { workspaceId: "1", whatsappCallId: "1" },
        { "sec-fetch-site": "cross-site" },
      ),
    )

    expect(response.status).toBe(403)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })

  test("accepts a same-origin request", async () => {
    const response = await POST(
      buildRequest(
        { workspaceId: "1", whatsappCallId: "1" },
        { "sec-fetch-site": "same-origin" },
      ),
    )

    expect(response.status).toBe(200)
    expect(endVoipCallAsAgent).toHaveBeenCalled()
  })

  test("rejects a malformed body", async () => {
    const response = await POST(buildRequest({ workspaceId: "1" }))

    expect(response.status).toBe(400)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })

  test("rejects a cross-workspace membership check", async () => {
    assertCurrentUserCanAccessChatbot.mockRejectedValue(
      new (await import("@chatbotx.io/business/errors")).ChatbotXException(
        "not a member",
      ),
    )

    const response = await POST(
      buildRequest({ workspaceId: "1", whatsappCallId: "1" }),
    )

    expect(response.status).toBe(403)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })

  test("still returns 200 when the call was already terminal elsewhere (idempotent)", async () => {
    endVoipCallAsAgent.mockResolvedValue(false)

    const response = await POST(
      buildRequest({ workspaceId: "1", whatsappCallId: "1" }),
    )

    expect(response.status).toBe(200)
  })

  test("cross-site + malformed body: rejected as cross-site (403), never reaches body parsing", async () => {
    const response = await POST(
      buildRequest({ workspaceId: "1" }, { "sec-fetch-site": "cross-site" }),
    )

    expect(response.status).toBe(403)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })

  test("no session + malformed body: rejected as unauthenticated (401), never reaches body parsing", async () => {
    getCurrentUserId.mockResolvedValue(null)

    const response = await POST(buildRequest({ workspaceId: "1" }))

    expect(response.status).toBe(401)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })

  test("only a Host header, no Sec-Fetch-Site/Origin/Referer at all: rejected as cross-site (fails closed)", async () => {
    const request = new Request(
      "http://localhost/api/whatsapp-voip-call-hangup",
      {
        method: "POST",
        body: JSON.stringify({ workspaceId: "1", whatsappCallId: "1" }),
        headers: { "Content-Type": "application/json", host: "localhost" },
      },
    ) as never

    const response = await POST(request)

    expect(response.status).toBe(403)
    expect(endVoipCallAsAgent).not.toHaveBeenCalled()
  })
})
