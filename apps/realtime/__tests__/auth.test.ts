import type * as Party from "partykit/server"
import { afterEach, describe, expect, test, vi } from "vitest"

const { loggerErrorMock, loggerInfoMock, postMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("ky", () => ({
  default: {
    post: postMock,
  },
}))

vi.mock("../src/logger", () => ({
  logger: {
    error: loggerErrorMock,
    info: loggerInfoMock,
  },
}))

const { getAuthSession } = await import("../src/lib/auth")

const validSession = {
  user: {
    name: "Ada",
    email: "ada@example.com",
    id: "user-1",
  },
  session: {
    expiresAt: "2999-01-01T00:00:00.000Z",
  },
}

const createRequest = () =>
  new Request(
    "https://realtime.example/workspace?token=one-time-token-secret&debug=true",
    {
      headers: {
        authorization: "Bearer authorization-secret",
        cookie: "session=cookie-secret",
        origin: "https://attacker.example",
      },
    },
  ) as Party.Request

const containsSensitiveValue = (
  value: unknown,
  request: Party.Request,
  seenValues = new WeakSet<object>(),
): boolean => {
  if (value === request) {
    return true
  }

  if (typeof value === "string") {
    return [
      "one-time-token-secret",
      "authorization-secret",
      "cookie-secret",
      "?token=one-time-token-secret&debug=true",
    ].some((secretValue) => value.includes(secretValue))
  }

  if (!value || typeof value !== "object") {
    return false
  }

  if (seenValues.has(value)) {
    return false
  }
  seenValues.add(value)

  return Object.values(value).some((nestedValue) =>
    containsSensitiveValue(nestedValue, request, seenValues),
  )
}

afterEach(() => {
  postMock.mockReset()
  loggerErrorMock.mockReset()
  loggerInfoMock.mockReset()
})

describe("getAuthSession", () => {
  test("verifies the token against the trusted builder URL, not request Origin", async () => {
    postMock.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue(validSession),
    })

    await getAuthSession(createRequest())

    expect(postMock).toHaveBeenCalledWith(
      "http://localhost:3123/api/auth/one-time-token/verify",
      { json: { token: "one-time-token-secret" } },
    )
  })

  test("does not log token, proxied request, auth headers, cookies, or query string", async () => {
    const request = createRequest()
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    postMock.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue(validSession),
    })

    await getAuthSession(request)

    const logCalls = [
      ...loggerInfoMock.mock.calls,
      ...loggerErrorMock.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ]

    expect(
      logCalls.some((call) => containsSensitiveValue(call, request)),
    ).toBe(false)
  })

  test("does not log sensitive failure details", async () => {
    const request = createRequest()
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    postMock.mockImplementationOnce(() => {
      throw new Error(
        "one-time-token-secret authorization-secret cookie-secret ?token=one-time-token-secret&debug=true",
      )
    })

    await expect(getAuthSession(request)).rejects.toThrow(
      "Failed to authenticate user",
    )

    const logCalls = [
      ...loggerInfoMock.mock.calls,
      ...loggerErrorMock.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ]

    expect(
      logCalls.some((call) => containsSensitiveValue(call, request)),
    ).toBe(false)
  })
})
