import { beforeEach, describe, expect, test, vi } from "vitest"

const { debugTokenOrThrowMock } = vi.hoisted(() => ({
  debugTokenOrThrowMock: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  debugTokenOrThrow: debugTokenOrThrowMock,
}))

const { hasWhatsappCapiScope } = await import(
  "@/features/integration-whatsapp/libs/capi-scope"
)

const params = {
  accessToken: "user-token",
  appAccessToken: "app-id|app-secret",
  wabaId: "1606681630903299",
}

describe("hasWhatsappCapiScope", () => {
  beforeEach(() => {
    debugTokenOrThrowMock.mockReset()
  })

  test("is true when manage_events targets the Business Presence account, not the WABA", async () => {
    debugTokenOrThrowMock.mockResolvedValueOnce({
      granular_scopes: [
        {
          scope: "whatsapp_business_management",
          target_ids: ["1606681630903299"],
        },
        {
          scope: "whatsapp_business_manage_events",
          target_ids: ["1053913244099763"],
        },
      ],
    })

    await expect(hasWhatsappCapiScope(params)).resolves.toBe(true)
  })

  test("is false when the token never lists manage_events", async () => {
    debugTokenOrThrowMock.mockResolvedValueOnce({
      granular_scopes: [
        {
          scope: "whatsapp_business_management",
          target_ids: ["1606681630903299"],
        },
      ],
    })

    await expect(hasWhatsappCapiScope(params)).resolves.toBe(false)
  })
})
