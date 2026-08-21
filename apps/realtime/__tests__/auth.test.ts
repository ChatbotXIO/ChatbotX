import { afterEach, describe, expect, it, vi } from "vitest"

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
  }
})

vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { getAuthSession } from "../src/lib/auth"

const okResponse = (body: unknown) => ({
  json: vi.fn().mockResolvedValue(body),
})

const validSession = {
  user: { name: "Agent", email: "agent@example.com", id: "u_1" },
  session: { expiresAt: "2999-01-01T00:00:00.000Z" },
}

const makeRequest = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers }) as unknown as Parameters<
    typeof getAuthSession
  >[0]

afterEach(() => {
  postMock.mockReset()
})

describe("getAuthSession", () => {
  it("verifies against the browser Origin header when present", async () => {
    postMock.mockReturnValueOnce(okResponse(validSession))

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1",
      { origin: "https://tenant.example.com" },
    )

    const session = await getAuthSession(request)

    expect(session).toEqual(validSession)
    expect(postMock).toHaveBeenCalledWith(
      "https://tenant.example.com/api/auth/one-time-token/verify",
      { json: { token: "ott-1" } },
    )
  })

  it("falls back to the validated domain query param when Origin is absent (React Native clients)", async () => {
    postMock.mockReturnValueOnce(okResponse(validSession))

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=https%3A%2F%2Ftenant.example.com",
    )

    const session = await getAuthSession(request)

    expect(session).toEqual(validSession)
    expect(postMock).toHaveBeenCalledWith(
      "https://tenant.example.com/api/auth/one-time-token/verify",
      { json: { token: "ott-1" } },
    )
  })

  it("ignores a malformed domain param and falls back to the default origin", async () => {
    postMock.mockReturnValueOnce(okResponse(validSession))

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=not-a-url",
    )

    await getAuthSession(request)

    expect(postMock).toHaveBeenCalledWith(
      "https://example.com/api/auth/one-time-token/verify",
      { json: { token: "ott-1" } },
    )
  })

  it("rejects a non-https domain param instead of trusting it", async () => {
    postMock.mockReturnValueOnce(okResponse(validSession))

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=http%3A%2F%2Ftenant.example.com",
    )

    await getAuthSession(request)

    expect(postMock).toHaveBeenCalledWith(
      "https://example.com/api/auth/one-time-token/verify",
      { json: { token: "ott-1" } },
    )
  })

  it("throws when no token is provided", async () => {
    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1",
    )

    await expect(getAuthSession(request)).rejects.toThrow("No token provided")
    expect(postMock).not.toHaveBeenCalled()
  })

  it("throws when the verified session is expired", async () => {
    postMock.mockReturnValueOnce(
      okResponse({
        ...validSession,
        session: { expiresAt: "2000-01-01T00:00:00.000Z" },
      }),
    )

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1",
      { origin: "https://tenant.example.com" },
    )

    await expect(getAuthSession(request)).rejects.toThrow(
      "Failed to authenticate user",
    )
  })
})
