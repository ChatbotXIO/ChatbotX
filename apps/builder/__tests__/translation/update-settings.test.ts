// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolveTranslationModel: vi.fn(),
  toSettingsResource: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/ai/translation", () => ({
  resolveTranslationModel: mocks.resolveTranslationModel,
  TranslationIntegrationUnavailableError: class TranslationIntegrationUnavailableError extends Error {},
}))
vi.mock("@chatbotx.io/business", () => ({
  inboxTranslationSettingsService: { update: mocks.update },
}))
vi.mock("@/features/translation/lib/availability", () => ({
  toSettingsResource: mocks.toSettingsResource,
}))

const { updateTranslationSettings } = await import(
  "@/features/translation/lib/update-settings"
)

const modelConfig = { provider: "openai" as const, model: "gpt-4o-mini" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.toSettingsResource.mockResolvedValue({ enabled: false })
})

describe("updateTranslationSettings", () => {
  test("requires a provider only when enabling", async () => {
    await expect(
      updateTranslationSettings({
        workspaceId: "workspace-1",
        request: { enabled: true, modelConfig: null },
      }),
    ).rejects.toMatchObject({ code: "translationNotConfigured" })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("can turn off translation after its configured provider is unavailable", async () => {
    await updateTranslationSettings({
      workspaceId: "workspace-1",
      request: { enabled: false, modelConfig },
    })

    expect(mocks.resolveTranslationModel).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      enabled: false,
      modelConfig,
    })
  })

  test("validates the selected provider before enabling", async () => {
    mocks.resolveTranslationModel.mockResolvedValue({})

    await updateTranslationSettings({
      workspaceId: "workspace-1",
      request: { enabled: true, modelConfig },
    })

    expect(mocks.resolveTranslationModel).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      modelConfig,
    })
  })
})
