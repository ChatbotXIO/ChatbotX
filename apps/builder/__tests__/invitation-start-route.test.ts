// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "@/app/api/invitations/[code]/start/route"

const {
  checkApiRateLimit,
  findActiveByCode,
  getDomainFromHeader,
  resolveTenantByDomain,
} = vi.hoisted(() => ({
  checkApiRateLimit: vi.fn(),
  findActiveByCode: vi.fn(),
  getDomainFromHeader: vi.fn(),
  resolveTenantByDomain: vi.fn(),
}))

vi.mock("@chatbotx.io/auth/server", () => ({
  INVITATION_COOKIE_MAX_AGE_SECONDS: 600,
  INVITATION_COOKIE_NAME: "chatbotx_invitation",
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({ resolveTenantByDomain }))

vi.mock("@chatbotx.io/business", () => ({
  invitationService: { findActiveByCode },
}))

vi.mock("@chatbotx.io/utils", () => ({
  getPublicUrlFromRequest: (request: Request) => new URL(request.url),
}))

vi.mock("@/lib/domain", () => ({ getDomainFromHeader }))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit }))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.1",
  UNKNOWN_CLIENT_IP: "unknown",
}))

const request = (code = "invite-code") =>
  new Request(`https://chat.acme.com/api/invitations/${code}/start`)

const params = (code = "invite-code") => ({
  params: Promise.resolve({ code }),
})

beforeEach(() => {
  vi.clearAllMocks()
  getDomainFromHeader.mockResolvedValue("chat.acme.com")
  resolveTenantByDomain.mockResolvedValue("tenant-acme")
  findActiveByCode.mockResolvedValue({ id: "invite-1" })
  checkApiRateLimit.mockResolvedValue({ limited: false, retryAfter: 0 })
})

test("validates an invitation against the tenant resolved from its request domain", async () => {
  const response = await GET(request(), params())

  expect(resolveTenantByDomain).toHaveBeenCalledWith("chat.acme.com")
  expect(findActiveByCode).toHaveBeenCalledWith("invite-code", {
    tenantId: "tenant-acme",
  })
  expect(response.headers.get("location")).toBe(
    "https://chat.acme.com/auth/sign-up?callbackURL=%2Finvitations%2Finvite-code",
  )
})

test("sets a short-lived, httpOnly, same-site cookie carrying the code on success", async () => {
  const response = await GET(request(), params())

  const setCookie = response.headers.get("set-cookie") ?? ""
  expect(setCookie).toContain("chatbotx_invitation=invite-code")
  expect(setCookie).toContain("HttpOnly")
  expect(setCookie).toContain("SameSite=lax")
  expect(setCookie).toContain("Max-Age=600")
  expect(setCookie).toContain("Path=/")
})

describe("an invalid code (unknown, expired, or cross-tenant — findActiveByCode returns null for all three)", () => {
  test("redirects to sign-in with an error and sets no cookie", async () => {
    findActiveByCode.mockResolvedValue(null)

    const response = await GET(request(), params())

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://chat.acme.com/auth/sign-in?error=invalid_invitation",
    )
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})

test("rejects a flood of lookups from one IP with 429 and never reaches the tenant/invitation lookup", async () => {
  checkApiRateLimit.mockResolvedValue({ limited: true, retryAfter: 7 })

  const response = await GET(request(), params())

  expect(response.status).toBe(429)
  expect(response.headers.get("Retry-After")).toBe("7")
  expect(resolveTenantByDomain).not.toHaveBeenCalled()
  expect(findActiveByCode).not.toHaveBeenCalled()
})
