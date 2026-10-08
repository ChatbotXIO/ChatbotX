import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateAuthUnscoped: vi.fn(),
  findByIdUnscoped: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    updateAuthUnscoped: mocks.updateAuthUnscoped,
    findByIdUnscoped: mocks.findByIdUnscoped,
  },
  whatsappSignupSessionRepository: {},
  metaCapiEventRepository: {},
  LIVE_RUN_STATUSES: [],
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

describe("integrationWhatsappService.markWebhookVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("stamps webhookVerifiedAt and keeps the rest of the auth value", async () => {
    await integrationWhatsappService.markWebhookVerified("iw-1", {
      verifyToken: "verify-token",
      metadata: { isManual: true },
    })

    expect(mocks.updateAuthUnscoped).toHaveBeenCalledWith("iw-1", {
      verifyToken: "verify-token",
      metadata: {
        isManual: true,
        webhookVerifiedAt: "2026-10-08T00:00:00.000Z",
      },
    })
  })

  test("creates the metadata object when the auth value has none", async () => {
    await integrationWhatsappService.markWebhookVerified("iw-1", {
      verifyToken: "verify-token",
    })

    expect(mocks.updateAuthUnscoped).toHaveBeenCalledWith("iw-1", {
      verifyToken: "verify-token",
      metadata: { webhookVerifiedAt: "2026-10-08T00:00:00.000Z" },
    })
  })
})
