import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInstagramAccounts: vi.fn(),
}))

vi.mock("../src/apis/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/auth")>()
  return {
    ...actual,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserInstagramAccounts: mocks.getUserInstagramAccounts,
  }
})

const { integration } = await import("../src/integration")

const credential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "",
  version: "v23.0",
  stateParams: { workspaceId: "workspace-1" },
}

describe("Instagram Facebook connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl:
        "https://app.example.test/integrations/instagram-facebook/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)

    expect(parsed.searchParams.get("state")).toBe("session-1.abc123")
    expect(parsed.searchParams.get("client_id")).toBe("client-1")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/integrations/instagram-facebook/callback",
    )
    expect(parsed.hostname).toBe("www.facebook.com")
  })
})

describe("Instagram Facebook connection.exchangeCode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exchangeCodeForToken.mockResolvedValue("user-access-token")
  })

  test("returns a user-level oauth2 AuthValue with no account metadata yet", async () => {
    const auth = await integration.connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential,
    })

    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith(
      credential,
      "auth-code",
      "https://app.example.test/callback",
    )
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "",
      version: "v23.0",
      tokens: { accessToken: "user-access-token" },
    })
  })
})

describe("Instagram Facebook connection.listCandidates", () => {
  const userAuth = {
    authType: "oauth2" as const,
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "",
    version: "v23.0",
    tokens: { accessToken: "user-access-token" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("maps every Instagram account to its own page-scoped auth and metadata", async () => {
    mocks.getUserInstagramAccounts.mockResolvedValue([
      {
        id: "ig-1",
        name: "Instagram One",
        username: "instagram-one",
        pageId: "page-1",
        pageAccessToken: "page-1-token",
      },
      {
        id: "ig-2",
        name: "Instagram Two",
        username: "instagram-two",
        profile_picture_url: "https://example.test/avatar.png",
        pageId: "page-2",
        pageAccessToken: "page-2-token",
      },
    ])

    const candidates = await integration.connection.listCandidates?.({
      auth: userAuth,
    })

    expect(mocks.getUserInstagramAccounts).toHaveBeenCalledWith(
      "user-access-token",
      "v23.0",
    )
    expect(candidates).toEqual([
      {
        sourceId: "ig-1",
        displayName: "Instagram One",
        auth: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "",
          version: "v23.0",
          tokens: { accessToken: "page-1-token" },
          metadata: {
            igId: "ig-1",
            igName: "Instagram One",
            pageId: "page-1",
            version: "v23.0",
            username: "instagram-one",
          },
        },
      },
      {
        sourceId: "ig-2",
        displayName: "Instagram Two",
        auth: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "",
          version: "v23.0",
          tokens: { accessToken: "page-2-token" },
          metadata: {
            igId: "ig-2",
            igName: "Instagram Two",
            pageId: "page-2",
            version: "v23.0",
            username: "instagram-two",
          },
        },
      },
    ])
  })

  test("returns no candidates for a non-oauth2 auth value", async () => {
    const candidates = await integration.connection.listCandidates?.({
      auth: { authType: "none" },
    })

    expect(candidates).toEqual([])
    expect(mocks.getUserInstagramAccounts).not.toHaveBeenCalled()
  })
})

describe("Instagram Facebook connection.candidateToConfig", () => {
  test("returns page and username fields required by the satellite table", () => {
    const config = integration.connection.candidateToConfig?.({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "",
      tokens: { accessToken: "page-access-token" },
      metadata: {
        igId: "ig-1",
        igName: "Instagram One",
        pageId: "page-1",
        version: "v23.0",
        username: "instagram-one",
      },
    })

    expect(config).toEqual({ pageId: "page-1", username: "instagram-one" })
  })
})
