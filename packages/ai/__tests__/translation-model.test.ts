import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByWorkspaceIdAndId: vi.fn(),
  getAIIntegrationInDB: vi.fn(),
  createAIModelInstance: vi.fn(),
  createOpenaiCompatibleModelInstance: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationOpenaiCompatibleService: {
    findByWorkspaceIdAndId: mocks.findByWorkspaceIdAndId,
  },
}))
vi.mock("../src/server/factory", () => ({
  getAIIntegrationInDB: mocks.getAIIntegrationInDB,
  createAIModelInstance: mocks.createAIModelInstance,
}))
vi.mock("../src/server/openai-compatible", () => ({
  createOpenaiCompatibleModelInstance:
    mocks.createOpenaiCompatibleModelInstance,
}))

const { resolveTranslationModel, TranslationIntegrationUnavailableError } =
  await import("../src/server/services/translation-model")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createAIModelInstance.mockReturnValue("built-in-model")
  mocks.createOpenaiCompatibleModelInstance.mockReturnValue("compatible-model")
})

describe("resolveTranslationModel", () => {
  test("resolves a built-in provider without caring about auto-reply", async () => {
    mocks.getAIIntegrationInDB.mockResolvedValue({ id: "i1" })

    const resolved = await resolveTranslationModel({
      workspaceId: "w1",
      modelConfig: { provider: "openai", model: "gpt-x" },
    })

    expect(resolved).toEqual({
      model: "built-in-model",
      modelId: "openai/gpt-x",
    })
    expect(mocks.getAIIntegrationInDB).toHaveBeenCalledWith({
      workspaceId: "w1",
      provider: "openai",
    })
  })

  test("resolves muse like any built-in provider", async () => {
    mocks.getAIIntegrationInDB.mockResolvedValue({ id: "i1" })

    await resolveTranslationModel({
      workspaceId: "w1",
      modelConfig: { provider: "muse", model: "muse-spark" },
    })

    expect(mocks.createAIModelInstance).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "muse", modelId: "muse-spark" }),
    )
  })

  test("resolves an enabled OpenAI-compatible integration of the workspace", async () => {
    mocks.findByWorkspaceIdAndId.mockResolvedValue({ id: "c1", enabled: true })

    const resolved = await resolveTranslationModel({
      workspaceId: "w1",
      modelConfig: {
        kind: "openaiCompatible",
        integrationId: "c1",
        model: "m",
      },
    })

    expect(resolved).toEqual({
      model: "compatible-model",
      modelId: "openaiCompatible/m",
    })
    expect(mocks.findByWorkspaceIdAndId).toHaveBeenCalledWith({
      workspaceId: "w1",
      id: "c1",
    })
  })

  test.each([
    ["not configured", null],
    ["malformed", { provider: "nope", model: "x" }],
  ])("rejects a config that is %s", async (_label, modelConfig) => {
    await expect(
      resolveTranslationModel({
        workspaceId: "w1",
        modelConfig: modelConfig as never,
      }),
    ).rejects.toBeInstanceOf(TranslationIntegrationUnavailableError)
  })

  test("rejects a missing built-in integration", async () => {
    mocks.getAIIntegrationInDB.mockResolvedValue(undefined)

    await expect(
      resolveTranslationModel({
        workspaceId: "w1",
        modelConfig: { provider: "claude", model: "m" },
      }),
    ).rejects.toMatchObject({ code: "integrationUnavailable" })
  })

  test.each([
    ["missing or in another workspace", undefined],
    ["disabled", { id: "c1", enabled: false }],
  ])("rejects an OpenAI-compatible integration that is %s", async (_label, row) => {
    mocks.findByWorkspaceIdAndId.mockResolvedValue(row)

    await expect(
      resolveTranslationModel({
        workspaceId: "w1",
        modelConfig: {
          kind: "openaiCompatible",
          integrationId: "c1",
          model: "m",
        },
      }),
    ).rejects.toBeInstanceOf(TranslationIntegrationUnavailableError)
  })

  test("turns unusable credentials into integrationUnavailable", async () => {
    mocks.getAIIntegrationInDB.mockResolvedValue({ id: "i1" })
    mocks.createAIModelInstance.mockImplementation(() => {
      throw new Error("Invalid AI integration auth configuration")
    })

    await expect(
      resolveTranslationModel({
        workspaceId: "w1",
        modelConfig: { provider: "openai", model: "m" },
      }),
    ).rejects.toMatchObject({ code: "integrationUnavailable" })
  })

  test.each([
    ["built-in", { provider: "openai", model: "m" }],
    [
      "openai-compatible",
      { kind: "openaiCompatible", integrationId: "c1", model: "m" },
    ],
  ] as const)("lets a database error reading a %s integration through, not as integrationUnavailable", async (_label, modelConfig) => {
    const outage = new Error("connection terminated unexpectedly")
    mocks.getAIIntegrationInDB.mockRejectedValue(outage)
    mocks.findByWorkspaceIdAndId.mockRejectedValue(outage)

    const attempt = resolveTranslationModel({
      workspaceId: "w1",
      modelConfig: modelConfig as never,
    })

    await expect(attempt).rejects.toBe(outage)
    await expect(attempt).rejects.not.toBeInstanceOf(
      TranslationIntegrationUnavailableError,
    )
  })
})
