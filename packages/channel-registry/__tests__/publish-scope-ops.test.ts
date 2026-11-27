import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  facebook: vi.fn(),
  instagramFacebook: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-messenger/apis/token-scopes", () => ({
  readTokenScopes: mocks.facebook,
}))
vi.mock(
  "@chatbotx.io/integration-instagram-facebook/apis/token-scopes",
  () => ({
    readTokenScopes: mocks.instagramFacebook,
  }),
)

const { createPublishScopeOps } = await import("../src/publish-scope-ops")

const auth = {
  clientId: "app",
  clientSecret: "secret",
  metadata: { version: "v23.0" },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createPublishScopeOps", () => {
  test("a Facebook Page is read with debug_token and the app access token", async () => {
    mocks.facebook.mockResolvedValue({ kind: "scopes", scopes: ["a"] })

    const result = await createPublishScopeOps().readScopes({
      accessToken: "page-token",
      auth,
      publisherKey: "facebook",
    })

    expect(result).toEqual({ kind: "scopes", scopes: ["a"] })
    expect(mocks.facebook).toHaveBeenCalledWith({
      appAccessToken: "app|secret",
      inputToken: "page-token",
      version: "v23.0",
    })
  })

  test("Instagram through Facebook Login uses its own package's reader", async () => {
    mocks.instagramFacebook.mockResolvedValue({ kind: "rateLimited" })

    const result = await createPublishScopeOps().readScopes({
      accessToken: "page-token",
      auth: { ...auth, version: "v24.0" },
      publisherKey: "instagramFacebook",
    })

    expect(result).toEqual({ kind: "rateLimited" })
    expect(mocks.instagramFacebook).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v24.0" }),
    )
    expect(mocks.facebook).not.toHaveBeenCalled()
  })

  test.each([
    "instagram",
    "threads",
    "tiktok",
  ] as const)("%s has no documented source: unreported, no call", async (publisherKey) => {
    const result = await createPublishScopeOps().readScopes({
      accessToken: "t",
      auth,
      publisherKey,
    })

    expect(result).toEqual({ kind: "unreported" })
    expect(mocks.facebook).not.toHaveBeenCalled()
    expect(mocks.instagramFacebook).not.toHaveBeenCalled()
  })

  test("an auth without app credentials fails without calling the platform", async () => {
    const result = await createPublishScopeOps().readScopes({
      accessToken: "t",
      auth: { tokens: {} },
      publisherKey: "facebook",
    })

    expect(result).toEqual({ kind: "failed" })
    expect(mocks.facebook).not.toHaveBeenCalled()
  })
})
