// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertWorkspaceSuperAdmin: vi.fn(),
  buildProviderCallbackUrl: vi.fn(),
  getOriginUrlFromHeader: vi.fn(),
  issueOAuthNonce: vi.fn(),
  redirect: vi.fn(),
  resolveForOwner: vi.fn(),
  resolveOwnerForWorkspace: vi.fn(),
}))

class ThrownRedirect extends Error {
  url: string

  constructor(url: string) {
    super(`redirect:${url}`)
    this.url = url
  }
}

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))
vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))
vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: mocks.resolveOwnerForWorkspace,
}))
vi.mock("@/lib/provider-origin", () => ({
  buildProviderCallbackUrl: mocks.buildProviderCallbackUrl,
}))
vi.mock("@/lib/domain", () => ({
  getOriginUrlFromHeader: mocks.getOriginUrlFromHeader,
}))
vi.mock("@/lib/oauth-state-nonce", () => ({
  issueOAuthNonce: mocks.issueOAuthNonce,
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirect(url)
    throw new ThrownRedirect(url)
  },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

const { startSocialAccountOAuth } = await import(
  "@/features/social-accounts/lib/start-social-account-oauth"
)

const workspace = { id: "ws-1", ownerId: "owner-1" }
const credential = {
  config: { clientId: "app-1", clientSecret: "s", version: "v23.0" },
}

const start = async (provider: "tiktok") => {
  try {
    await startSocialAccountOAuth({
      provider,
      workspace: workspace as never,
    })
  } catch (error) {
    if (error instanceof ThrownRedirect) {
      return new URL(error.url)
    }
    throw error
  }
  throw new Error("expected a redirect")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.resolveOwnerForWorkspace.mockResolvedValue("owner-1")
  mocks.resolveForOwner.mockResolvedValue(credential)
  mocks.buildProviderCallbackUrl.mockImplementation(
    async (_credential: unknown, path: string) =>
      `https://broker.example.test${path}`,
  )
  mocks.getOriginUrlFromHeader.mockResolvedValue("https://builder.example.test")
  mocks.issueOAuthNonce.mockResolvedValue("nonce-1")
})

describe("startSocialAccountOAuth", () => {
  test("a non-super-admin is refused before anything else happens", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValue(new Error("forbidden"))

    await expect(start("tiktok")).rejects.toThrow("forbidden")

    expect(mocks.resolveForOwner).not.toHaveBeenCalled()
    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
  })

  test("TikTok uses its own publishing app, not the inbox one, and asks for the publishing scopes", async () => {
    const url = await start("tiktok")

    expect(mocks.resolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "tiktokPublishing",
    })
    expect(url.origin + url.pathname).toBe(
      "https://www.tiktok.com/v2/auth/authorize/",
    )
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish")
    expect(url.searchParams.get("client_key")).toBe("app-1")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://broker.example.test/integrations/tiktok/callback",
    )
  })

  test("TikTok without its publishing app configured is refused (the inbox app does not count)", async () => {
    mocks.resolveForOwner.mockImplementation(
      async ({ type }: { type: string }) =>
        type === "tiktok" ? credential : null,
    )

    await expect(start("tiktok")).rejects.toThrow()

    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
  })

  test("a workspace without the platform app configured is refused", async () => {
    mocks.resolveForOwner.mockResolvedValue(null)

    await expect(start("tiktok")).rejects.toThrow()

    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
  })

  test.each([
    "facebook",
    "instagram",
    "threads",
  ])("%s has no publishing login: it publishes with the inbox token", async (provider) => {
    await expect(
      startSocialAccountOAuth({
        provider: provider as never,
        workspace: workspace as never,
      }),
    ).rejects.toThrow("providerNotSupported")

    expect(mocks.resolveForOwner).not.toHaveBeenCalled()
    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
  })

  test("the state names the flow, the network, the workspace and a fresh nonce", async () => {
    const url = await start("tiktok")

    const state = JSON.parse(
      Buffer.from(url.searchParams.get("state") ?? "", "base64").toString(),
    )
    expect(state).toMatchObject({
      flow: "socialAccount",
      nonce: "nonce-1",
      referer: "https://builder.example.test/space/ws-1/posts/connect",
      socialProvider: "tiktok",
      workspaceId: "ws-1",
    })
  })

  test("the nonce is issued once per start", async () => {
    await start("tiktok")

    expect(mocks.issueOAuthNonce).toHaveBeenCalledTimes(1)
  })
})
