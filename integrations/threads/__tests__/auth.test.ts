import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  buildThreadsAuthValue,
  exchangeCodeForToken,
  generateAuthUrl,
  getThreadsProfile,
  refreshAccessToken,
} from "../src/apis/auth"
import { DEFAULT_API_VERSION, THREADS_GRAPH_API_URL } from "../src/constants"

describe("threads auth", () => {
  test("generateAuthUrl uses official threads.com domain and required scopes", () => {
    const url = new URL(
      generateAuthUrl({
        clientId: "client-id",
        redirectUrl: "https://example.com/callback",
        stateParams: { workspaceId: "1" },
      }),
    )

    expect(url.origin).toBe("https://threads.com")
    expect(url.pathname).toBe("/oauth/authorize")
    expect(url.searchParams.get("scope")).toContain("threads_basic")
    expect(url.searchParams.get("scope")).toContain("threads_manage_replies")
  })

  test("exchangeCodeForToken exchanges short-lived token for long-lived token", async () => {
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/oauth/access_token`,
        async ({ request }) => {
          const body = await request.text()
          expect(body).toContain("client_id=client-id")
          expect(body).toContain("grant_type=authorization_code")
          return HttpResponse.json({
            access_token: "short-lived-token",
            expires_in: 3600,
          })
        },
      ),
      http.get(`${THREADS_GRAPH_API_URL}/access_token`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("grant_type")).toBe("th_exchange_token")
        expect(url.searchParams.get("client_secret")).toBe("client-secret")
        expect(url.searchParams.get("access_token")).toBe("short-lived-token")
        return HttpResponse.json({
          access_token: "long-lived-token",
          expires_in: 5_184_000,
        })
      }),
    )

    await expect(
      exchangeCodeForToken(
        { clientId: "client-id", clientSecret: "client-secret" },
        "oauth-code",
        "https://example.com/callback",
      ),
    ).resolves.toEqual(
      expect.objectContaining({ accessToken: "long-lived-token" }),
    )
  })

  test("refreshAccessToken uses th_refresh_token grant", async () => {
    server.use(
      http.get(
        `${THREADS_GRAPH_API_URL}/refresh_access_token`,
        ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get("grant_type")).toBe("th_refresh_token")
          expect(url.searchParams.get("access_token")).toBe("old-token")
          return HttpResponse.json({
            access_token: "new-token",
            expires_in: 7200,
          })
        },
      ),
    )

    await expect(
      refreshAccessToken({
        accessToken: "old-token",
      }),
    ).resolves.toEqual(expect.objectContaining({ accessToken: "new-token" }))
  })

  test("refreshAccessToken leaves expiresAt undefined when provider omits expires_in", async () => {
    server.use(
      http.get(`${THREADS_GRAPH_API_URL}/refresh_access_token`, () =>
        HttpResponse.json({
          access_token: "new-token",
        }),
      ),
    )

    await expect(
      refreshAccessToken({
        accessToken: "old-token",
      }),
    ).resolves.toEqual({
      accessToken: "new-token",
      expiresAt: undefined,
    })
  })

  test("getThreadsProfile reads me profile from graph.threads.com", async () => {
    server.use(
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/me`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("access_token")).toBe("threads-token")
        return HttpResponse.json({
          id: "123",
          username: "chatbotx",
          threads_biography: "bio",
        })
      }),
    )

    await expect(getThreadsProfile("threads-token")).resolves.toEqual(
      expect.objectContaining({
        id: "123",
        username: "chatbotx",
      }),
    )
  })

  test("buildThreadsAuthValue defaults metadata.version to the package default", () => {
    expect(
      buildThreadsAuthValue({
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUrl: "https://example.com/callback",
        accessToken: "threads-token",
        threadsUserId: "threads-user-1",
        username: "chatbotx",
      }),
    ).toEqual(
      expect.objectContaining({
        authType: "oauth2",
        tokens: {
          accessToken: "threads-token",
          expiresAt: undefined,
        },
        metadata: expect.objectContaining({
          threadsUserId: "threads-user-1",
          username: "chatbotx",
          version: DEFAULT_API_VERSION,
        }),
      }),
    )
  })
})
