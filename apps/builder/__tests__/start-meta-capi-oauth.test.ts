// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertWorkspaceSuperAdmin: vi.fn(),
  findMessenger: vi.fn(),
  findInstagram: vi.fn(),
  resolveForOwner: vi.fn(),
  resolveOwnerForWorkspace: vi.fn(),
  buildProviderCallbackUrl: vi.fn(),
  getOriginUrlFromHeader: vi.fn(),
  issueOAuthNonce: vi.fn(),
  redirect: vi.fn(),
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
  messengerIntegrationService: { findByIdForWorkspace: mocks.findMessenger },
  instagramIntegrationService: { findByIdForWorkspace: mocks.findInstagram },
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

const { startMetaCapiOAuth } = await import(
  "@/features/meta-conversions/lib/start-meta-capi-oauth"
)

const workspace = { id: "ws-1", ownerId: "owner-1" }
const messengerCredential = {
  config: { clientId: "msg-app", clientSecret: "s", version: "v25.0" },
}
const instagramCredential = {
  config: { clientId: "ig-app", clientSecret: "s", version: "v25.0" },
}

const startAndCaptureRedirect = async (
  channel: "messenger" | "instagram",
): Promise<URL> => {
  try {
    await startMetaCapiOAuth({
      channel,
      workspace: workspace as never,
      integrationId: "7",
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
  mocks.findMessenger.mockResolvedValue({ id: "7" })
  mocks.findInstagram.mockResolvedValue({ id: "7", type: "facebook" })
  mocks.resolveOwnerForWorkspace.mockResolvedValue("platform-owner")
  mocks.resolveForOwner.mockImplementation(
    async ({ type }: { type: string }) =>
      type === "messenger" ? messengerCredential : instagramCredential,
  )
  mocks.buildProviderCallbackUrl.mockImplementation(
    async (_credential: unknown, path: string) =>
      `https://broker.example.test${path}`,
  )
  mocks.getOriginUrlFromHeader.mockResolvedValue("https://builder.example.test")
  mocks.issueOAuthNonce.mockResolvedValue("nonce-1")
})

describe("startMetaCapiOAuth", () => {
  test("sends a Messenger admin to the CAPI-only dialog and returns to the Ads tab", async () => {
    const url = await startAndCaptureRedirect("messenger")

    expect(url.origin + url.pathname).toBe(
      "https://www.facebook.com/v25.0/dialog/oauth",
    )
    expect(url.searchParams.get("client_id")).toBe("msg-app")
    expect(url.searchParams.get("scope")).toBe("page_events,pages_show_list")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://broker.example.test/integrations/messenger/callback",
    )
    expect(
      JSON.parse(
        Buffer.from(url.searchParams.get("state") ?? "", "base64").toString(),
      ),
    ).toEqual({
      workspaceId: "ws-1",
      referer: "https://builder.example.test/space/ws-1/messengers/7/ads",
      flow: "metaCapi",
      capiChannel: "messenger",
      capiIntegrationId: "7",
      nonce: "nonce-1",
    })
    expect(mocks.resolveForOwner).toHaveBeenCalledWith({
      ownerId: "platform-owner",
      type: "messenger",
    })
  })

  test("uses the Instagram Facebook-login app and callback for Instagram", async () => {
    const url = await startAndCaptureRedirect("instagram")

    expect(url.searchParams.get("client_id")).toBe("ig-app")
    expect(url.searchParams.get("scope")).toBe(
      "instagram_manage_events,instagram_basic,pages_show_list",
    )
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://broker.example.test/integrations/instagram-facebook/callback",
    )
    expect(JSON.parse(atob(url.searchParams.get("state") ?? ""))).toMatchObject(
      {
        referer: "https://builder.example.test/space/ws-1/instagrams/7/ads",
        capiChannel: "instagram",
        nonce: "nonce-1",
      },
    )
    expect(mocks.resolveForOwner).toHaveBeenCalledWith({
      ownerId: "platform-owner",
      type: "instagramFacebook",
    })
  })

  test("requires a super admin before touching anything", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(new Error("nope"))

    await expect(
      startMetaCapiOAuth({
        channel: "messenger",
        workspace: workspace as never,
        integrationId: "7",
      }),
    ).rejects.toThrow("nope")

    expect(mocks.findMessenger).not.toHaveBeenCalled()
    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  test("refuses an integration that is not in the workspace", async () => {
    mocks.findMessenger.mockResolvedValueOnce(null)

    await expect(
      startMetaCapiOAuth({
        channel: "messenger",
        workspace: workspace as never,
        integrationId: "7",
      }),
    ).rejects.toThrow("messengerNotFound")

    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
  })

  test("refuses an Instagram Business Login account", async () => {
    mocks.findInstagram.mockResolvedValueOnce({ id: "7", type: "instagram" })

    await expect(
      startMetaCapiOAuth({
        channel: "instagram",
        workspace: workspace as never,
        integrationId: "7",
      }),
    ).rejects.toThrow("instagramRequiresFacebook")

    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  test("explains when the platform app is not configured, without issuing a nonce", async () => {
    mocks.resolveForOwner.mockResolvedValueOnce(null)

    await expect(
      startMetaCapiOAuth({
        channel: "messenger",
        workspace: workspace as never,
        integrationId: "7",
      }),
    ).rejects.toThrow("appNotConfigured")

    expect(mocks.issueOAuthNonce).not.toHaveBeenCalled()
  })
})
