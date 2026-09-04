import {
  AuthException,
  ChannelError,
  ChannelErrorCategory,
} from "@chatbotx.io/sdk"
import { HTTPError } from "ky"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { getThreadsProfileMock, refreshAccessTokenMock, webhookHandlerMock } =
  vi.hoisted(() => ({
    getThreadsProfileMock: vi.fn(),
    refreshAccessTokenMock: vi.fn(),
    webhookHandlerMock: vi.fn(),
  }))

vi.mock("../src/apis/auth", async () => {
  const actual =
    await vi.importActual<typeof import("../src/apis/auth")>("../src/apis/auth")

  return {
    ...actual,
    getThreadsProfile: getThreadsProfileMock,
    refreshAccessToken: refreshAccessTokenMock,
  }
})

vi.mock("../src/handlers/webhook", () => ({
  webhookHandler: webhookHandlerMock,
}))

import { rescue, ThreadsException } from "../src/exception"
import { integration } from "../src/integration"
import { isRevokedTokenError, mapToChannelError } from "../src/lib/error-mapper"
import {
  getSafeErrorDetails,
  sanitizeSensitiveText,
} from "../src/lib/error-sanitizer"

const makeHttpError = (status: number, body: unknown) =>
  new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request("https://graph.threads.com/v1.0/me"),
    {} as never,
  )

beforeEach(() => {
  getThreadsProfileMock.mockReset()
  refreshAccessTokenMock.mockReset()
  webhookHandlerMock.mockReset()
})

describe("threads integration dispatch", () => {
  test("getProfile delegates to the auth API with the current token and version", async () => {
    getThreadsProfileMock.mockResolvedValue({
      id: "profile-1",
      username: "chatbotx",
      name: "chatbotx",
    })

    await expect(
      integration.actions.getProfile({
        ctx: {
          auth: {
            tokens: { accessToken: "threads-token" },
            metadata: { version: "v2.1" },
          },
        },
      } as never),
    ).resolves.toEqual({
      id: "profile-1",
      username: "chatbotx",
      name: "chatbotx",
    })

    expect(getThreadsProfileMock).toHaveBeenCalledWith("threads-token", "v2.1")
  })

  test("refreshAuth throws when accessToken is missing", async () => {
    await expect(
      integration.refreshAuth?.({
        auth: {
          tokens: {},
        },
      } as never),
    ).rejects.toBeInstanceOf(AuthException)
  })

  test("refreshAuth persists the refreshed access token and expiry", async () => {
    refreshAccessTokenMock.mockResolvedValue({
      accessToken: "refreshed-token",
      expiresAt: "2026-08-12T02:00:00.000Z",
    })

    await expect(
      integration.refreshAuth?.({
        auth: {
          tokens: {
            accessToken: "old-token",
            refreshToken: "refresh-token",
          },
          metadata: { version: "v1.0" },
        },
      } as never),
    ).resolves.toMatchObject({
      tokens: {
        accessToken: "refreshed-token",
        expiresAt: "2026-08-12T02:00:00.000Z",
        refreshToken: "refresh-token",
      },
      metadata: { version: "v1.0" },
    })

    expect(refreshAccessTokenMock).toHaveBeenCalledWith({
      accessToken: "old-token",
    })
  })

  test("handleRequest dispatches webhook requests for GET and POST", async () => {
    webhookHandlerMock
      .mockResolvedValueOnce("challenge")
      .mockResolvedValueOnce("ok")

    await expect(
      integration.handleRequest?.({
        req: new Request("https://example.com/integrations/threads/webhook", {
          method: "GET",
        }),
      } as never),
    ).resolves.toBe("challenge")

    await expect(
      integration.handleRequest?.({
        req: new Request("https://example.com/integrations/threads/webhook", {
          method: "POST",
          body: "{}",
        }),
      } as never),
    ).resolves.toBe("ok")

    expect(webhookHandlerMock).toHaveBeenCalledTimes(2)
  })

  test("handleRequest rejects unknown request actions", async () => {
    await expect(
      integration.handleRequest?.({
        req: new Request("https://example.com/integrations/threads/unknown", {
          method: "POST",
        }),
      } as never),
    ).rejects.toThrow(
      "POST https://example.com/integrations/threads/unknown is not implemented",
    )
  })
})

describe("threads error mapping", () => {
  test.each([
    {
      title: "auth failures",
      error: new ThreadsException("auth", { code: 190 }),
      category: ChannelErrorCategory.AUTH_FAILED,
      httpStatusCode: 401,
    },
    {
      title: "permission denied code ranges",
      error: new ThreadsException("permission", { code: 250 }),
      category: ChannelErrorCategory.PERMISSION_DENIED,
      httpStatusCode: 403,
    },
    {
      title: "rate limited codes",
      error: new ThreadsException("rate", { code: 4 }),
      category: ChannelErrorCategory.RATE_LIMITED,
      httpStatusCode: 429,
    },
    {
      title: "quota exceeded codes",
      error: new ThreadsException("quota", { code: 2_207_042 }),
      category: ChannelErrorCategory.QUOTA_EXCEEDED,
      httpStatusCode: 429,
    },
    {
      title: "network codes",
      error: new ThreadsException("network", { code: 2 }),
      category: ChannelErrorCategory.NETWORK_ERROR,
      httpStatusCode: 503,
    },
    {
      title: "payload validation codes",
      error: new ThreadsException("payload", { code: 100 }),
      category: ChannelErrorCategory.PAYLOAD_INVALID,
      httpStatusCode: 400,
    },
    {
      title: "unknown provider errors",
      error: new ThreadsException("unknown"),
      category: ChannelErrorCategory.UNKNOWN,
      httpStatusCode: 400,
    },
  ])("maps $title to the expected ChannelError category", ({
    error,
    category,
    httpStatusCode,
  }) => {
    expect(mapToChannelError(error)).toMatchObject({
      message: error.message,
      category,
      code: error.code ?? "channel_error",
      httpStatusCode,
    })
  })

  test("maps auth failures from OAuth exception types and 401 statuses", () => {
    expect(
      mapToChannelError(
        new ThreadsException("oauth", { type: "OAuthException" }),
      ).category,
    ).toBe(ChannelErrorCategory.AUTH_FAILED)
    expect(
      mapToChannelError(
        new ThreadsException("unauthorized", { httpStatusCode: 401 }),
      ).category,
    ).toBe(ChannelErrorCategory.AUTH_FAILED)
  })

  test("maps rate limited and network conditions from HTTP statuses and messages", () => {
    expect(
      mapToChannelError(
        new ThreadsException("slow down", { httpStatusCode: 429 }),
      ).category,
    ).toBe(ChannelErrorCategory.RATE_LIMITED)
    expect(
      mapToChannelError(
        new ThreadsException("server exploded", { httpStatusCode: 503 }),
      ).category,
    ).toBe(ChannelErrorCategory.NETWORK_ERROR)
    expect(
      mapToChannelError(
        new ThreadsException("request did not finish within 30 seconds"),
      ).category,
    ).toBe(ChannelErrorCategory.NETWORK_ERROR)
    expect(
      mapToChannelError(new ThreadsException("network connection reset"))
        .category,
    ).toBe(ChannelErrorCategory.NETWORK_ERROR)
  })

  test("maps HTTPError origins to network failures", () => {
    const error = new ThreadsException("provider failed").setOriginError(
      makeHttpError(502, { error: { message: "upstream down" } }),
    )

    expect(mapToChannelError(error).category).toBe(
      ChannelErrorCategory.NETWORK_ERROR,
    )
  })

  test("passes ChannelError instances through without remapping", () => {
    const channelError = new ChannelError(
      "already mapped",
      ChannelErrorCategory.UNKNOWN,
      {
        code: "custom",
      },
    )

    expect(mapToChannelError(channelError)).toBe(channelError)
  })

  test("sanitizes unknown errors before wrapping them as ChannelError", () => {
    const mapped = mapToChannelError(
      new Error(
        "failed at https://graph.threads.com/v1.0/me?access_token=secret&client_secret=super-secret",
      ),
    )

    expect(mapped.category).toBe(ChannelErrorCategory.UNKNOWN)
    expect(mapped.message).toContain("[REDACTED]")
    expect(mapped.message).not.toContain("secret")
    expect(mapped.message).not.toContain("super-secret")
  })

  test("detects revoked token subcodes precisely", () => {
    expect(
      isRevokedTokenError(
        new ThreadsException("revoked", {
          code: 190,
          subCode: "458",
        }),
      ),
    ).toBe(true)
    expect(
      isRevokedTokenError(
        new ThreadsException("revoked", {
          code: 190,
          subCode: null,
        }),
      ),
    ).toBe(false)
    expect(
      isRevokedTokenError(
        new ThreadsException("revoked", {
          code: 190,
          subCode: 999,
        }),
      ),
    ).toBe(false)
    expect(isRevokedTokenError(new Error("nope"))).toBe(false)
  })
})

describe("threads exception rescue", () => {
  test("rethrows existing ThreadsException instances untouched", async () => {
    const existing = new ThreadsException("already normalized", { code: 190 })

    await expect(
      rescue("me", () => {
        throw existing
      }),
    ).rejects.toBe(existing)
  })

  test("wraps HTTPError responses with sanitized API details", async () => {
    const error = makeHttpError(403, {
      error: {
        message: "denied https://graph.threads.com/v1.0/me?access_token=secret",
        code: 10,
        error_subcode: 1234,
        type: "OAuthException",
      },
    })

    const thrown = await rescue("me", () => {
      throw error
    }).catch((caught: unknown) => caught)

    expect(thrown).toBeInstanceOf(ThreadsException)
    expect(thrown).toMatchObject({
      code: 10,
      subCode: 1234,
      type: "OAuthException",
      httpStatusCode: 403,
      originError: error,
    })
    expect((thrown as Error).message).toContain("[REDACTED]")
    expect((thrown as Error).message).not.toContain("secret")
  })

  test("falls back to the raw HTTPError message when the response body is not JSON", async () => {
    const error = new HTTPError(
      new Response("upstream exploded", {
        status: 502,
        headers: { "content-type": "text/plain" },
      }),
      new Request("https://graph.threads.com/v1.0/me"),
      {} as never,
    )

    const thrown = await rescue("me", () => {
      throw error
    }).catch((caught: unknown) => caught)

    expect(thrown).toBeInstanceOf(ThreadsException)
    expect((thrown as ThreadsException).httpStatusCode).toBe(502)
    expect((thrown as Error).message).toContain("Threads API error at me:")
  })

  test("sanitizes non-Error failures before wrapping them", async () => {
    const thrown = await rescue("me", () =>
      Promise.reject("authorization=secret-token"),
    ).catch((caught: unknown) => caught)

    expect(thrown).toBeInstanceOf(ThreadsException)
    expect((thrown as Error).message).toContain("authorization=[REDACTED]")
    expect((thrown as Error).message).not.toContain("secret-token")
  })
})

describe("threads error sanitizer", () => {
  test("redacts sensitive URL params, assignments, and malformed URLs", () => {
    const sanitized = sanitizeSensitiveText(
      'broken https://%zz?access_token=secret access_token=abc authorization: bearer-token client_secret="ultra-secret"',
    )

    expect(sanitized).toContain("https://%zz?access_token=[REDACTED]")
    expect(sanitized).toContain("access_token=[REDACTED]")
    expect(sanitized).toContain("authorization: [REDACTED]")
    expect(sanitized).toContain('client_secret="[REDACTED]"')
    expect(sanitized).not.toContain("access_token=abc")
    expect(sanitized).not.toContain("bearer-token")
    expect(sanitized).not.toContain("ultra-secret")
  })

  test("getSafeErrorDetails preserves typed metadata for Error objects", () => {
    const error = Object.assign(
      new Error("https://graph.threads.com/v1.0/me?refresh_token=secret"),
      {
        code: 190,
        httpStatusCode: 401,
        subCode: 458,
        type: "OAuthException",
      },
    )

    expect(getSafeErrorDetails(error)).toEqual({
      code: 190,
      httpStatusCode: 401,
      subCode: 458,
      type: "OAuthException",
      message: "https://graph.threads.com/v1.0/me?refresh_token=[REDACTED]",
    })
  })

  test("getSafeErrorDetails stringifies non-Error values safely", () => {
    expect(getSafeErrorDetails("client_secret=top-secret")).toEqual({
      message: "client_secret=[REDACTED]",
    })
  })
})
