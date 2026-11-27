import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updatePixRedirectEnabled: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    updatePixRedirectEnabled: mocks.updatePixRedirectEnabled,
  },
  whatsappSignupSessionRepository: {},
  metaCapiEventRepository: {},
  LIVE_RUN_STATUSES: [],
}))

vi.mock("../src/flow/service", () => ({ flowService: {} }))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const target = { id: "iw-1", workspaceId: "ws-1" }

describe("integrationWhatsappService.updatePixRedirectEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updatePixRedirectEnabled.mockResolvedValue({ id: "iw-1" })
  })

  test.each([
    true,
    false,
  ])("stores %s scoped to the workspace", async (enabled) => {
    await integrationWhatsappService.updatePixRedirectEnabled({
      ...target,
      enabled,
    })

    expect(mocks.updatePixRedirectEnabled).toHaveBeenCalledWith({
      ...target,
      enabled,
    })
  })

  test("an integration outside the workspace is not found", async () => {
    mocks.updatePixRedirectEnabled.mockResolvedValue(null)

    await expect(
      integrationWhatsappService.updatePixRedirectEnabled({
        ...target,
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
