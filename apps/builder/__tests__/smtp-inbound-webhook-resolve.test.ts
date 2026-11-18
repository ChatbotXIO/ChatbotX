// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"

const integrationSmtpService = {
  findByIdForWorkspace: vi.fn(),
  getOrCreateInboundToken: vi.fn(),
  rotateInboundToken: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ integrationSmtpService }))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))
vi.mock("@/lib/provider-origin", () => ({
  resolveTenantProviderOrigin: vi.fn(async () => "https://broker.test"),
}))

const { resolveInboundWebhook } = await import(
  "@/features/integration-smtp/lib/inbound-webhook"
)

const command = {
  workspaceId: "ws-1",
  ownerId: "owner-1",
  id: "smtp-1",
  rotate: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("builds the secret URL on the tenant origin for a relay provider", async () => {
  integrationSmtpService.findByIdForWorkspace.mockResolvedValue({
    auth: { provider: "postmark" },
  })
  integrationSmtpService.getOrCreateInboundToken.mockResolvedValue("tok123")

  const result = await resolveInboundWebhook(command)

  expect(result.url).toBe(
    "https://broker.test/integrations/smtp/webhook/tok123",
  )
  expect(result.provider).toBe("postmark")
  expect(result.instructions).toContain("Postmark")
  expect(integrationSmtpService.rotateInboundToken).not.toHaveBeenCalled()
})

test("rotate mints a fresh token instead of reusing the stored one", async () => {
  integrationSmtpService.findByIdForWorkspace.mockResolvedValue({
    auth: { provider: "sendgrid" },
  })
  integrationSmtpService.rotateInboundToken.mockResolvedValue("new456")

  const result = await resolveInboundWebhook({ ...command, rotate: true })

  expect(result.url).toContain("/new456")
  expect(integrationSmtpService.getOrCreateInboundToken).not.toHaveBeenCalled()
})

test("mailbox providers are refused: they receive through IMAP", async () => {
  integrationSmtpService.findByIdForWorkspace.mockResolvedValue({
    auth: { provider: "google" },
  })

  await expect(resolveInboundWebhook(command)).rejects.toThrow("IMAP")
  expect(integrationSmtpService.getOrCreateInboundToken).not.toHaveBeenCalled()
})
