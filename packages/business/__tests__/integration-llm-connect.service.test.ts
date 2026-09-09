import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// connect/update/disconnect on the four LLM provider services (Claude,
// DeepSeek, Gemini, OpenAI). `connect` delegates the upsert to the shared
// connectAiProviderIntegration helper and audits connect/update based on
// whether a row already existed; `update` patches provider-specific fields
// (e.g. autoReply) directly; `disconnect` removes the parent integration row.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectAiProviderIntegration: vi.fn(),
  dispatchAuditRecord: vi.fn(),
  findFirstClaude: vi.fn(),
  findFirstDeepseek: vi.fn(),
  findFirstGemini: vi.fn(),
  findFirstOpenai: vi.fn(),
  deleteWhere: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/integration-ai-provider/connect", () => ({
  connectAiProviderIntegration: mocks.connectAiProviderIntegration,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationClaudeModel: { findFirst: mocks.findFirstClaude },
      integrationDeepseekModel: { findFirst: mocks.findFirstDeepseek },
      integrationGeminiModel: { findFirst: mocks.findFirstGemini },
      integrationOpenaiModel: { findFirst: mocks.findFirstOpenai },
    },
    delete: vi.fn(() => ({ where: mocks.deleteWhere })),
    update: vi.fn(() => ({ set: mocks.updateSet })),
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationClaudeModel: { id: "id", workspaceId: "workspaceId" },
  integrationDeepseekModel: { id: "id", workspaceId: "workspaceId" },
  integrationGeminiModel: { id: "id", workspaceId: "workspaceId" },
  integrationModel: { id: "id" },
  integrationOpenaiModel: { id: "id", workspaceId: "workspaceId" },
}))

const { integrationClaudeService } = await import(
  "../src/integration-claude/service"
)
const { integrationDeepSeekService } = await import(
  "../src/integration-deepseek/service"
)
const { integrationGeminiService } = await import(
  "../src/integration-gemini/service"
)
const { integrationOpenAIService } = await import(
  "../src/integration-openai/service"
)

const connectProps = {
  workspaceId: "workspace-1",
  apiKey: "secret-key",
  model: "some-model",
  temperature: 0.5,
  maxOutputTokens: 1024,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
  mocks.updateReturning.mockResolvedValue([{ id: "existing-1" }])
})

describe.each([
  {
    findFirst: mocks.findFirstClaude,
    label: "Claude",
    provider: "claude",
    service: integrationClaudeService,
  },
  {
    findFirst: mocks.findFirstDeepseek,
    label: "DeepSeek",
    provider: "deepseek",
    service: integrationDeepSeekService,
  },
  {
    findFirst: mocks.findFirstGemini,
    label: "Gemini",
    provider: "gemini",
    service: integrationGeminiService,
  },
  {
    findFirst: mocks.findFirstOpenai,
    label: "OpenAI",
    provider: "openai",
    service: integrationOpenAIService,
  },
])("$label connect/update/disconnect", ({
  findFirst,
  label,
  provider,
  service,
}) => {
  test("connect delegates to connectAiProviderIntegration and audits update when a row exists", async () => {
    findFirst.mockResolvedValue({ id: "existing-1" })

    await service.connect(connectProps)

    expect(mocks.connectAiProviderIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationType: provider,
        input: connectProps,
        existing: { id: "existing-1" },
      }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        detail: `updated the ${label} integration configuration`,
      }),
    )
  })

  test("connect audits connect when no row exists", async () => {
    findFirst.mockResolvedValue(undefined)

    await service.connect(connectProps)

    expect(mocks.connectAiProviderIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationType: provider,
        input: connectProps,
        existing: undefined,
      }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "connect",
        detail: `connected a new ${label} integration`,
      }),
    )
  })

  test("disconnect deletes the parent integration row and audits disconnect", async () => {
    findFirst.mockResolvedValue({
      id: "existing-1",
      integrationId: "integration-1",
    })

    await service.disconnect(connectProps.workspaceId)

    expect(mocks.deleteWhere).toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "disconnect",
        detail: `disconnected the ${label} integration`,
      }),
    )
  })

  test("disconnect is a no-op when no integration exists", async () => {
    findFirst.mockResolvedValue(undefined)

    await service.disconnect(connectProps.workspaceId)

    expect(mocks.deleteWhere).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("update", () => {
  test("Claude update patches the row and audits update", async () => {
    mocks.findFirstClaude.mockResolvedValue({ id: "existing-1" })

    const result = await integrationClaudeService.update(
      { workspaceId: connectProps.workspaceId },
      { autoReply: true },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith({ autoReply: true })
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        detail: "updated the Claude integration configuration",
      }),
    )
    expect(result).toEqual({ id: "existing-1" })
  })

  test("Claude update throws when no integration exists", async () => {
    mocks.findFirstClaude.mockResolvedValue(undefined)

    await expect(
      integrationClaudeService.update(
        { workspaceId: connectProps.workspaceId },
        { autoReply: true },
      ),
    ).rejects.toThrow("Integration Claude not found")
  })

  test("OpenAI update looks up by workspaceId + id", async () => {
    mocks.findFirstOpenai.mockResolvedValue({ id: "existing-1" })

    await integrationOpenAIService.update(
      { workspaceId: connectProps.workspaceId, id: "existing-1" },
      { autoReply: true },
    )

    expect(mocks.findFirstOpenai).toHaveBeenCalledWith({
      where: { workspaceId: connectProps.workspaceId, id: "existing-1" },
    })
  })
})
