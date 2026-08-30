import { afterEach, describe, expect, it, vi } from "vitest"

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock, get: getMock },
  }
})

vi.mock("../src/env", () => ({
  env: { NEXT_PUBLIC_BUILDER_URL: "https://builder.example.com" },
}))

vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { getAuthSession } from "../src/lib/auth"

const okResponse = (body: unknown) => ({
  json: vi.fn().mockResolvedValue(body),
})

const allowlistAllows = (origin: string) =>
  getMock.mockReturnValueOnce(okResponse({ allowed: true, origin }))

const allowlistRejects = () =>
  getMock.mockReturnValueOnce(okResponse({ allowed: false }))

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
  getMock.mockReset()
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
    allowlistAllows("https://tenant-rn.example.com")
    postMock.mockReturnValueOnce(okResponse(validSession))

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=https%3A%2F%2Ftenant-rn.example.com",
    )

    const session = await getAuthSession(request)

    expect(session).toEqual(validSession)
    expect(getMock).toHaveBeenCalledWith(
      "https://builder.example.com/api/realtime/verify-origin?host=tenant-rn.example.com",
    )
    expect(postMock).toHaveBeenCalledWith(
      "https://tenant-rn.example.com/api/auth/one-time-token/verify",
      { json: { token: "ott-1" } },
    )
  })

  it("ignores a malformed domain param and rejects the connection", async () => {
    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=not-a-url",
    )

    await expect(getAuthSession(request)).rejects.toThrow("Unrecognized domain")
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects a non-https domain param instead of trusting it", async () => {
    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=http%3A%2F%2Ftenant-insecure.example.com",
    )

    await expect(getAuthSession(request)).rejects.toThrow("Unrecognized domain")
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects a domain param not on the builder's registered-origin allowlist", async () => {
    allowlistRejects()

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=https%3A%2F%2Fevil.example",
    )

    await expect(getAuthSession(request)).rejects.toThrow("Unrecognized domain")
    expect(getMock).toHaveBeenCalledWith(
      "https://builder.example.com/api/realtime/verify-origin?host=evil.example",
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects when the allowlist lookup itself fails", async () => {
    getMock.mockImplementationOnce(() => {
      throw new Error("network error")
    })

    const request = makeRequest(
      "https://realtime.example.com/parties/workspaces/w_1?token=ott-1&domain=https%3A%2F%2Ftenant-unreachable.example.com",
    )

    await expect(getAuthSession(request)).rejects.toThrow("Unrecognized domain")
    expect(postMock).not.toHaveBeenCalled()
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
