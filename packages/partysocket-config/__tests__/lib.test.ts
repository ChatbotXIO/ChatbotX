import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BEARER_PREFIX_RE = /^Bearer /

const { postMock, signRealtimeTokenMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  signRealtimeTokenMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
  }
})

vi.mock("../src/auth", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../src/auth")
  return { ...actual, signRealtimeToken: signRealtimeTokenMock }
})

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

import {
  broadcastToWorkspaceParty,
  buildBroadcastAuthHeader,
  revokeWorkspaceMemberConnections,
  sendToWorkspaceMember,
} from "../src/lib"

const target = { url: "https://realtime.example.com", secret: "s".repeat(32) }
const event = {
  eventType: "typing",
  data: { conversationId: "c_1", typing: true, seconds: 1 },
} as const

beforeEach(() => {
  signRealtimeTokenMock.mockReset()
  signRealtimeTokenMock.mockResolvedValue("test-token")
})

describe("sendToWorkspaceMember", () => {
  it("posts with a userId query param and the raw event body unchanged", async () => {
    postMock.mockReset()
    postMock.mockReturnValueOnce({ status: 200 })

    await sendToWorkspaceMember(target, "ws_1", "u_1", event)

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, options] = postMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(path).toBe("parties/workspaces/ws_1")
    expect(options.baseUrl).toBe(target.url)
    expect(options.searchParams).toEqual({ userId: "u_1" })
    expect(options.json).toEqual(event)
    expect(
      String((options.headers as Record<string, string>).Authorization),
    ).toMatch(BEARER_PREFIX_RE)
  })

  it("swallows a network failure and returns null", async () => {
    postMock.mockReset()
    postMock.mockImplementationOnce(() => {
      throw new Error("network error")
    })

    await expect(
      sendToWorkspaceMember(target, "ws_1", "u_1", event),
    ).resolves.toBeNull()
  })

  it("never logs the request body (SDP) or the auth token when a ky HTTPError is thrown", async () => {
    const { HTTPError } = await import("ky")
    const request = new Request(
      "https://realtime.example.com/parties/workspaces/ws_1",
    )
    const response = new Response("err", { status: 500 })
    // A ky HTTPError retains `options.json` (request body) and headers.
    const httpError = new HTTPError(response, request, {
      json: { data: { offer: { sdp: "v=0 SECRET-SDP" } } },
      headers: { Authorization: "Bearer SECRET-TOKEN" },
    } as never)

    postMock.mockReset()
    postMock.mockImplementationOnce(() => {
      throw httpError
    })
    const { logger } = await import("../src/logger")
    ;(logger.error as ReturnType<typeof vi.fn>).mockClear()

    await sendToWorkspaceMember(target, "ws_1", "u_1", event)

    const logged = JSON.stringify(
      (logger.error as ReturnType<typeof vi.fn>).mock.calls,
    )
    expect(logged).not.toContain("v=0 SECRET-SDP")
    expect(logged).not.toContain("SECRET-TOKEN")
  })
})

describe("revokeWorkspaceMemberConnections", () => {
  it("posts a revoke action with the target userId, no event body", async () => {
    postMock.mockReset()
    postMock.mockReturnValueOnce({ status: 200 })

    await revokeWorkspaceMemberConnections(target, "ws_1", "u_1")

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, options] = postMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(path).toBe("parties/workspaces/ws_1")
    expect(options.searchParams).toEqual({ action: "revoke", userId: "u_1" })
    expect(options.json).toBeUndefined()
  })

  it("swallows a network failure and returns null", async () => {
    postMock.mockReset()
    postMock.mockImplementationOnce(() => {
      throw new Error("network error")
    })

    await expect(
      revokeWorkspaceMemberConnections(target, "ws_1", "u_1"),
    ).resolves.toBeNull()
  })
})

describe("broadcastToWorkspaceParty (unchanged)", () => {
  it("posts with no target query params and the raw event body", async () => {
    postMock.mockReset()
    postMock.mockReturnValueOnce({ status: 200 })

    await broadcastToWorkspaceParty(target, "ws_1", event)

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, options] = postMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(path).toBe("parties/workspaces/ws_1")
    expect(options.searchParams).toBeUndefined()
    expect(options.json).toEqual(event)
  })

  it("reuses a signed header for repeated workspace broadcasts", async () => {
    postMock.mockReset()
    postMock.mockReturnValue({ status: 200 })

    await broadcastToWorkspaceParty(target, "ws_cached", event)
    await broadcastToWorkspaceParty(target, "ws_cached", event)
    await broadcastToWorkspaceParty(target, "ws_cached", event)

    expect(signRealtimeTokenMock).toHaveBeenCalledTimes(1)
  })
})

describe("buildBroadcastAuthHeader", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("re-signs after the header reuse window expires", async () => {
    vi.useFakeTimers()
    const audience = { kind: "workspace" as const, id: "expired_workspace" }

    await buildBroadcastAuthHeader(audience, target.secret)
    await vi.advanceTimersByTimeAsync(45_001)
    await buildBroadcastAuthHeader(audience, target.secret)

    expect(signRealtimeTokenMock).toHaveBeenCalledTimes(2)
  })

  it("keeps headers separate for different audiences", async () => {
    await buildBroadcastAuthHeader(
      { kind: "workspace", id: "workspace_1" },
      target.secret,
    )
    await buildBroadcastAuthHeader(
      { kind: "workspace", id: "workspace_2" },
      target.secret,
    )

    expect(signRealtimeTokenMock).toHaveBeenCalledTimes(2)
  })

  it("evicts a failed signing attempt so a later broadcast retries it", async () => {
    signRealtimeTokenMock
      .mockRejectedValueOnce(new Error("signing failed"))
      .mockResolvedValueOnce("retried-token")
    const audience = { kind: "guest" as const, id: "retry_guest" }

    await expect(
      buildBroadcastAuthHeader(audience, target.secret),
    ).rejects.toThrow("signing failed")
    await expect(
      buildBroadcastAuthHeader(audience, target.secret),
    ).resolves.toBe("Bearer retried-token")

    expect(signRealtimeTokenMock).toHaveBeenCalledTimes(2)
  })

  it("evicts the oldest header once the cache reaches its capacity", async () => {
    const firstAudience = { kind: "guest" as const, id: "cap_guest_0" }

    for (let index = 0; index <= 10_000; index++) {
      await buildBroadcastAuthHeader(
        { kind: "guest", id: `cap_guest_${index}` },
        target.secret,
      )
    }
    await buildBroadcastAuthHeader(firstAudience, target.secret)

    expect(signRealtimeTokenMock).toHaveBeenCalledTimes(10_002)
  })
})
