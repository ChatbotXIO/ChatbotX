import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getInstagramAccount: vi.fn(),
}))

vi.mock("../src/apis/auth", () => ({
  exchangeCodeForToken: mocks.exchangeCodeForToken,
  getInstagramAccount: mocks.getInstagramAccount,
}))

const { integration } = await import("../src/integration")

const credential = {
  clientId: "client-id",
  clientSecret: "client-secret",
  version: "v22.0",
}

const account = {
  id: "instagram-page-id",
  userId: "instagram-user-id",
  name: "Instagram Business",
  username: "instagram.business",
  accessToken: "long-lived-access-token",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exchangeCodeForToken.mockResolvedValue({
    accessToken: "short-lived-access-token",
    userId: "token-exchange-user-id",
  })
  mocks.getInstagramAccount.mockResolvedValue(account)
})

describe("Instagram connection identity", () => {
  test("stores and verifies the Instagram user id while preserving the legacy page id", async () => {
    const auth = await integration.connection.exchangeCode?.({
      code: "authorization-code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential,
    })

    if (!auth) {
      throw new Error("Instagram connection has no exchangeCode")
    }

    expect(auth).toMatchObject({
      metadata: {
        igId: "instagram-user-id",
        pageId: "instagram-page-id",
      },
    })

    await expect(integration.connection.verify({ auth })).resolves.toEqual({
      ok: true,
    })
  })
})
