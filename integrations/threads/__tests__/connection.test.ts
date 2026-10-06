import { expectStateVerbatim } from "@chatbotx.io/vitest-config/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as ThreadsAuthApi from "../src/apis/auth"
import { THREADS_SCOPES } from "../src/constants"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getThreadsProfile: vi.fn(),
}))

vi.mock("../src/apis/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof ThreadsAuthApi>()
  return {
    ...actual,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getThreadsProfile: mocks.getThreadsProfile,
  }
})

// Dynamic import required: `vi.mock` above must be hoisted and applied before
// `../src/integration` (which imports `../src/apis/auth`) is ever evaluated —
// a static top-level import would resolve against the real module instead.
const { integration } = await import("../src/integration")

const connection = integration.connection
if (!connection) {
  throw new Error("Threads integration must define a connection block")
}

const credential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  version: "v1.0",
}

const profile = {
  id: "threads-user-1",
  username: "threads.user",
  name: "threads.user",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exchangeCodeForToken.mockResolvedValue({
    accessToken: "long-lived-access-token",
    expiresAt: "2026-09-15T13:00:00.000Z",
  })
  mocks.getThreadsProfile.mockResolvedValue(profile)
})

describe("Threads connection block", () => {
  test("has no webhook subscribe/unsubscribe — Threads has no per-user webhook", () => {
    expect(connection.webhook).toBeUndefined()
  })

  test("is a single-account OAuth-redirect channel", () => {
    expect(connection.kind).toBe("channel")
    expect(connection.strategy).toBe("oauth_redirect")
    expect(connection.multiAccount).toBe(false)
  })

  describe("authorizeUrl", () => {
    test("passes state through verbatim, not JSON/base64-wrapped", () => {
      const url = connection.authorizeUrl?.({
        credential,
        callbackUrl: "https://app.example.test/integrations/threads/callback",
        state: "session-1.abc123",
      })
      expectStateVerbatim(url, "session-1.abc123")

      const parsed = new URL(url as string)
      expect(parsed.searchParams.get("client_id")).toBe("client-1")
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        "https://app.example.test/integrations/threads/callback",
      )
      expect(parsed.searchParams.get("response_type")).toBe("code")
      expect(parsed.searchParams.get("scope")?.split(",")).toEqual(
        THREADS_SCOPES,
      )
    })
  })

  describe("exchangeCode", () => {
    test("exchanges the code, fetches the profile, and returns the complete account auth", async () => {
      const auth = await connection.exchangeCode?.({
        code: "auth-code",
        callbackUrl: "https://app.example.test/integrations/threads/callback",
        credential,
      })

      expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith(
        credential,
        "auth-code",
        "https://app.example.test/integrations/threads/callback",
      )
      expect(mocks.getThreadsProfile).toHaveBeenCalledWith(
        "long-lived-access-token",
        "v1.0",
      )
      expect(auth).toEqual({
        authType: "oauth2",
        clientId: "client-1",
        clientSecret: "secret-1",
        redirectUrl: "https://app.example.test/integrations/threads/callback",
        version: "v1.0",
        tokens: {
          accessToken: "long-lived-access-token",
          expiresAt: "2026-09-15T13:00:00.000Z",
        },
        metadata: {
          threadsUserId: "threads-user-1",
          username: "threads.user",
          version: "v1.0",
        },
      })
    })
  })

  describe("candidateToConfig / describe", () => {
    const auth = {
      authType: "oauth2" as const,
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "https://app.example.test/integrations/threads/callback",
      tokens: { accessToken: "token" },
      metadata: {
        threadsUserId: "threads-user-1",
        username: "threads.user",
        version: "v1.0",
      },
    }

    test("candidateToConfig returns the username from auth.metadata", () => {
      expect(connection.candidateToConfig?.(auth)).toEqual({
        username: "threads.user",
      })
    })

    test("describe derives sourceId/displayName from auth.metadata", () => {
      expect(connection.describe(auth)).toEqual({
        sourceId: "threads-user-1",
        displayName: "threads.user",
      })
    })
  })

  describe("verify", () => {
    test("resolves ok:true when the profile id matches the stored threadsUserId", async () => {
      await expect(
        connection.verify({
          auth: {
            authType: "oauth2",
            clientId: "client-1",
            clientSecret: "secret-1",
            redirectUrl: "https://app.example.test/callback",
            tokens: { accessToken: "token", expiresAt: undefined },
            metadata: {
              threadsUserId: "threads-user-1",
              username: "threads.user",
              version: "v1.0",
            },
          },
        }),
      ).resolves.toEqual({ ok: true })
    })

    test("resolves ok:false when the profile id no longer matches", async () => {
      mocks.getThreadsProfile.mockResolvedValueOnce({
        ...profile,
        id: "a-different-user",
      })

      await expect(
        connection.verify({
          auth: {
            authType: "oauth2",
            clientId: "client-1",
            clientSecret: "secret-1",
            redirectUrl: "https://app.example.test/callback",
            tokens: { accessToken: "token" },
            metadata: {
              threadsUserId: "threads-user-1",
              username: "threads.user",
              version: "v1.0",
            },
          },
        }),
      ).resolves.toMatchObject({ ok: false })
    })
  })

  test("isRevokedTokenError is wired to the shared threads error mapper", () => {
    expect(connection.isRevokedTokenError).toBeTypeOf("function")
  })
})
