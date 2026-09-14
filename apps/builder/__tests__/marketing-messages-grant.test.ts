import { beforeEach, describe, expect, test, vi } from "vitest"

const service = {
  findAuth: vi.fn(),
  decryptAuth: vi.fn(),
  markAuthInvalid: vi.fn(),
}
const debugToken = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessagesService: service,
  platformCredentialService: {
    resolveForOwner: vi.fn(async () => ({
      config: { clientId: "app", clientSecret: "secret", version: "v25.0" },
    })),
  },
}))
vi.mock("@chatbotx.io/integration-messenger/apis/auth", () => ({
  debugToken,
  toAppAccessToken: (c: { clientId: string; clientSecret: string }) =>
    `${c.clientId}|${c.clientSecret}`,
  hasMarketingMessages: (scopes?: string[]) =>
    scopes?.includes("marketing_messages_messenger") ?? false,
}))
vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(async () => "owner-1"),
}))

const { resolveMarketingMessagesGrant } = await import(
  "@/features/facebook-marketing-messages/lib/grant"
)

const workspace = { id: "w1" } as never
const future = new Date(Date.now() + 86_400_000)
const past = new Date(Date.now() - 86_400_000)

beforeEach(() => {
  vi.clearAllMocks()
  service.decryptAuth.mockResolvedValue({
    accessToken: "TOKEN",
    version: "v25.0",
  })
  debugToken.mockResolvedValue({
    is_valid: true,
    scopes: ["marketing_messages_messenger"],
  })
})

describe("resolveMarketingMessagesGrant", () => {
  test("is missing when there is no row", async () => {
    service.findAuth.mockResolvedValue(null)

    expect(await resolveMarketingMessagesGrant(workspace)).toEqual({
      state: "missing",
    })
  })

  test("is expired when the row is marked invalid", async () => {
    service.findAuth.mockResolvedValue({
      status: "invalid",
      tokenExpiresAt: future,
      facebookUserId: "u1",
    })

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe(
      "expired",
    )
    expect(debugToken).not.toHaveBeenCalled()
  })

  test("is expired when tokenExpiresAt is in the past", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: past,
      facebookUserId: "u1",
    })

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe(
      "expired",
    )
  })

  test("is valid when debug_token confirms the scope", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: future,
      facebookUserId: "u1",
    })

    expect(await resolveMarketingMessagesGrant(workspace)).toEqual({
      state: "valid",
      accessToken: "TOKEN",
      version: "v25.0",
      facebookUserId: "u1",
    })
  })

  test("is expired and flips the row when the scope was revoked", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: future,
      facebookUserId: "u1",
    })
    debugToken.mockResolvedValue({
      is_valid: true,
      scopes: ["pages_show_list"],
    })

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe(
      "expired",
    )
    expect(service.markAuthInvalid).toHaveBeenCalledWith("w1")
  })

  test("is expired when is_valid is false even though scopes are populated", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: future,
      facebookUserId: "u1",
    })
    debugToken.mockResolvedValue({
      is_valid: false,
      scopes: ["marketing_messages_messenger"],
    })

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe(
      "expired",
    )
    expect(service.markAuthInvalid).toHaveBeenCalledWith("w1")
  })

  test("is expired when the stored blob cannot be decrypted", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: future,
      facebookUserId: "u1",
    })
    service.decryptAuth.mockResolvedValue(null)

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe(
      "expired",
    )
  })

  test("is expired rather than throwing when debug_token itself fails", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: future,
      facebookUserId: "u1",
    })
    debugToken.mockRejectedValue(new Error("graph down"))

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe(
      "expired",
    )
  })

  test("treats a null expiry as not expired", async () => {
    service.findAuth.mockResolvedValue({
      status: "active",
      tokenExpiresAt: null,
      facebookUserId: null,
    })

    expect((await resolveMarketingMessagesGrant(workspace)).state).toBe("valid")
  })
})
