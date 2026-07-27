// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  accountHealthsComponentMock,
  findIntegrationWhatsappMock,
  findPhoneNumberDetailMock,
  findWabaMock,
  loggerWarnMock,
  verificationPanelMock,
} = vi.hoisted(() => ({
  accountHealthsComponentMock: vi.fn(() => null),
  findIntegrationWhatsappMock: vi.fn(),
  findPhoneNumberDetailMock: vi.fn(),
  findWabaMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  verificationPanelMock: vi.fn(() => null),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound")
  }),
}))

vi.mock("@/lib/log", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}))

vi.mock("@/features/integration-whatsapp/queries", () => ({
  findIntegrationWhatsapp: findIntegrationWhatsappMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  findPhoneNumberDetail: findPhoneNumberDetailMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba", () => ({
  findWaba: findWabaMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/constants", () => ({
  BUSINESS_URL: "https://business.facebook.com",
}))

vi.mock(
  "@/features/integration-whatsapp/components/whatsapp-account-healths",
  () => ({
    WhatsappAccountHealths: accountHealthsComponentMock,
  }),
)

vi.mock(
  "@/features/integration-whatsapp/verification/whatsapp-phone-verification-panel",
  () => ({
    WhatsappPhoneVerificationPanel: verificationPanelMock,
  }),
)

const { default: WhatsappAccountHealthsPage } = await import(
  "@/app/space/[workspaceId]/(integrations)/whatsapps/[id]/account-healths/page"
)

const integration = {
  id: "11625281870413824",
  workspaceId: "81399851597824",
  auth: {
    tokens: { accessToken: "access-token-1" },
    metadata: {
      businessId: "business-1",
      phoneNumber: { id: "phone-1" },
      wabaId: "waba-1",
      webhookUrl: "https://example.com/webhook",
    },
    version: "v23.0",
  },
  displayPhoneNumber: "+84 34 872 1855",
  name: "Banana Agency CX",
  registrationError: null,
  registrationStatus: "pending_verification",
  verificationCodeRequestedAt: null,
}

const params = Promise.resolve({
  workspaceId: integration.workspaceId,
  id: integration.id,
})

describe("WhatsappAccountHealthsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findIntegrationWhatsappMock.mockResolvedValue(integration)
    findWabaMock.mockResolvedValue({
      marketing_messages_onboarding_status: "ELIGIBLE",
    })
  })

  test("renders recovery UI instead of crashing when Meta phone health cannot be loaded", async () => {
    findPhoneNumberDetailMock.mockRejectedValueOnce(
      new Error("Unsupported get request"),
    )

    const page = await WhatsappAccountHealthsPage({ params })
    renderToStaticMarkup(page)

    expect(verificationPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayPhoneNumber: integration.displayPhoneNumber,
        integrationId: integration.id,
        verifiedName: integration.name,
        workspaceId: integration.workspaceId,
      }),
      undefined,
    )
    expect(accountHealthsComponentMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: integration.id }),
      "Unable to load WhatsApp phone number health",
    )
  })

  test("still renders phone health when only WABA health cannot be loaded", async () => {
    const phoneNumber = {
      id: "phone-1",
      display_phone_number: "+84 34 872 1855",
      verified_name: "Banana Agency CX",
      webhook_configuration: {},
    }
    findPhoneNumberDetailMock.mockResolvedValueOnce(phoneNumber)
    findWabaMock.mockRejectedValueOnce(new Error("WABA unavailable"))

    const page = await WhatsappAccountHealthsPage({ params })
    renderToStaticMarkup(page)

    expect(accountHealthsComponentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber,
        waba: {},
        webhookUrl: integration.auth.metadata.webhookUrl,
      }),
      undefined,
    )
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: integration.id }),
      "Unable to load WhatsApp WABA health",
    )
  })
})
