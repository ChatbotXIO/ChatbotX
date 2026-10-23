// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { verifyShopToken, checkGuestRateLimit } = vi.hoisted(() => ({
  verifyShopToken: vi.fn(),
  checkGuestRateLimit: vi.fn(),
}))

vi.mock("@chatbotx.io/encryption/shop-token", () => ({ verifyShopToken }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit,
  resolveGuestRateLimitKey: (_headers: Headers, fallback: string) => fallback,
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { resolveShopSession } = await import(
  "../src/features/webshop/lib/shop-session"
)
const { runShopAction } = await import(
  "../src/features/webshop/lib/shop-action"
)

const customerPayload = {
  mode: "customer",
  workspaceId: "11",
  contactId: "22",
  contactInboxId: "33",
  conversationId: null,
  expiresAt: Date.now() + 60_000,
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyShopToken.mockResolvedValue(customerPayload)
  checkGuestRateLimit.mockResolvedValue({ limited: false, retryAfter: 0 })
})

describe("resolveShopSession", () => {
  test("names the contact a customer token was signed for", async () => {
    await expect(resolveShopSession("11", "tok")).resolves.toEqual({
      mode: "customer",
      token: "tok",
      shopper: {
        workspaceId: "11",
        contactId: "22",
        contactInboxId: "33",
        conversationId: null,
      },
    })
  })

  test("refuses a token signed for another workspace", async () => {
    await expect(resolveShopSession("99", "tok")).resolves.toBeNull()
  })

  test("refuses a forged or expired token", async () => {
    verifyShopToken.mockRejectedValue(new Error("expired"))
    await expect(resolveShopSession("11", "tok")).resolves.toBeNull()
  })

  test("refuses an unresolved {{shop_token}} without verifying it", async () => {
    await expect(resolveShopSession("11", "{{shop_token}}")).resolves.toBeNull()
    expect(verifyShopToken).not.toHaveBeenCalled()
  })

  test("refuses a workspace id that is not a number", async () => {
    await expect(resolveShopSession("../x", "tok")).resolves.toBeNull()
  })
})

describe("runShopAction", () => {
  const input = { workspaceId: "11", token: "tok" }

  test("runs for the token's contact", async () => {
    const operation = vi.fn().mockResolvedValue("done")
    await expect(runShopAction(input, operation)).resolves.toEqual({
      ok: true,
      data: "done",
    })
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "11", contactId: "22" }),
    )
  })

  describe("a preview link", () => {
    beforeEach(() => {
      verifyShopToken.mockResolvedValue({
        mode: "preview",
        workspaceId: "11",
        expiresAt: Date.now() + 60_000,
      })
    })

    test("cannot place or rate an order", async () => {
      const operation = vi.fn()
      await expect(runShopAction(input, operation)).resolves.toEqual({
        ok: false,
        error: { code: "webshopPreviewOnly" },
      })
      expect(operation).not.toHaveBeenCalled()
    })

    test("runs its preview handler for the workspace, never the customer one", async () => {
      const operation = vi.fn()
      const onPreview = vi.fn().mockResolvedValue("previewed")
      await expect(runShopAction(input, operation, onPreview)).resolves.toEqual(
        { ok: true, data: "previewed" },
      )
      expect(onPreview).toHaveBeenCalledWith("11")
      expect(operation).not.toHaveBeenCalled()
    })

    test("is rate limited too", async () => {
      checkGuestRateLimit.mockResolvedValue({ limited: true, retryAfter: 30 })
      const onPreview = vi.fn()
      await expect(runShopAction(input, vi.fn(), onPreview)).resolves.toEqual({
        ok: false,
        error: { code: "rateLimited" },
      })
      expect(onPreview).not.toHaveBeenCalled()
    })

    test("a store refusal in preview comes back as its code", async () => {
      const error = new ChatbotXException("full", "webshopCartFull")
      await expect(
        runShopAction(input, vi.fn(), () => Promise.reject(error)),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "webshopCartFull" },
      })
    })
  })

  test("too many calls are refused", async () => {
    checkGuestRateLimit.mockResolvedValue({ limited: true, retryAfter: 30 })
    const operation = vi.fn()
    await expect(runShopAction(input, operation)).resolves.toEqual({
      ok: false,
      error: { code: "rateLimited" },
    })
    expect(operation).not.toHaveBeenCalled()
  })

  test("a store refusal comes back as its code for the page to translate", async () => {
    const error = new ChatbotXException("below", "orderBelowMinimum")
    error.data = { minimum: 50 }
    await expect(
      runShopAction(input, () => Promise.reject(error)),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "orderBelowMinimum",
        field: undefined,
        data: { minimum: 50 },
      },
    })
  })

  test("an unexpected error still throws", async () => {
    await expect(
      runShopAction(input, () => Promise.reject(new Error("db down"))),
    ).rejects.toThrow("db down")
  })
})
