// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"
import { GET } from "@/app/api/invitations/[code]/start/route"

const { findActiveByCode, getDomainFromHeader, resolveTenantByDomain } =
  vi.hoisted(() => ({
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

beforeEach(() => {
  vi.clearAllMocks()
  getDomainFromHeader.mockResolvedValue("chat.acme.com")
  resolveTenantByDomain.mockResolvedValue("tenant-acme")
  findActiveByCode.mockResolvedValue({ id: "invite-1" })
})

test("validates an invitation against the tenant resolved from its request domain", async () => {
  const response = await GET(
    new Request("https://chat.acme.com/api/invitations/invite-code/start"),
    { params: Promise.resolve({ code: "invite-code" }) },
  )

  expect(resolveTenantByDomain).toHaveBeenCalledWith("chat.acme.com")
  expect(findActiveByCode).toHaveBeenCalledWith("invite-code", {
    tenantId: "tenant-acme",
  })
  expect(response.headers.get("location")).toBe(
    "https://chat.acme.com/auth/sign-up?callbackURL=%2Finvitations%2Finvite-code",
  )
})
