import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(async () => []),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  transaction: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  validateBaseUrl: vi.fn(async (baseURL: string) => baseURL.trim()),
}))

vi.mock("../src/integration-openai-compatible/validate-base-url", () => ({
  normalizeOpenaiCompatibleBaseUrl: (baseURL: string) => baseURL.trim(),
  validateOpenaiCompatibleBaseUrlForEnvironment: mocks.validateBaseUrl,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {
    query: {
      integrationOpenaiCompatibleModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
    },
    transaction: mocks.transaction,
    update: vi.fn(() => ({
      set: mocks.updateSet,
    })),
  },
  eq: vi.fn(),
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationModel: { id: "id" },
  integrationOpenaiCompatibleModel: { id: "id", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

const { integrationOpenaiCompatibleService } = await import(
  "../src/integration-openai-compatible/service"
)

describe("IntegrationOpenaiCompatibleService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([])
    mocks.validateBaseUrl.mockImplementation(async (baseURL: string) =>
      baseURL.trim(),
    )
    mocks.insertReturning.mockResolvedValue([{ id: "integration-1" }])
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        insert: vi.fn(() => ({
          values: (data: unknown) => {
            mocks.insertValues(data)
            return { returning: mocks.insertReturning }
          },
        })),
      }),
    )
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
  })

  test("validates and persists normalized base URL on connect", async () => {
    mocks.validateBaseUrl.mockResolvedValue("https://example.com/v1")

    await integrationOpenaiCompatibleService.connect({
      workspaceId: "workspace-1",
      name: "NIM",
      preset: "nim",
      baseURL: " https://example.com/v1 ",
      defaultModel: "model-1",
      apiKey: "secret",
    })

    expect(mocks.validateBaseUrl).toHaveBeenCalledWith(
      " https://example.com/v1 ",
    )
    expect(mocks.insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseURL: "https://example.com/v1",
      }),
    )
  })

  test("validates changed base URL on update and persists normalized value", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "openai-compatible-1",
      baseURL: "https://old.example.com/v1",
    })
    mocks.validateBaseUrl.mockResolvedValue("https://new.example.com/v1")

    await integrationOpenaiCompatibleService.update(
      "workspace-1",
      "openai-compatible-1",
      { baseURL: " https://new.example.com/v1 " },
    )

    expect(mocks.validateBaseUrl).toHaveBeenCalledWith(
      "https://new.example.com/v1",
    )
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://new.example.com/v1",
      }),
    )
  })

  test("does not run environment validation when normalized base URL is unchanged", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "openai-compatible-1",
      baseURL: "https://example.com/v1",
    })

    await integrationOpenaiCompatibleService.update(
      "workspace-1",
      "openai-compatible-1",
      { baseURL: " https://example.com/v1 " },
    )

    expect(mocks.validateBaseUrl).not.toHaveBeenCalled()
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://example.com/v1",
      }),
    )
  })
})
