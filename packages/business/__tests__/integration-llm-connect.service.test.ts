import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// connect() on the four LLM provider services (Claude, DeepSeek, Gemini,
// OpenAI) — mirrors integrationOpenRouterService.connect but audits
// unconditionally (no isSameJsonValue diff) and, for OpenAI specifically,
// records the audit with an explicit workspaceId because
// connectOpenAIAction runs on authActionClient (no workspaceId in the audit
// ALS actor).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  dispatchAuditRecord: vi.fn(),
  findFirstClaude: vi.fn(),
  findFirstDeepseek: vi.fn(),
  findFirstGemini: vi.fn(),
  findFirstOpenai: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  transaction: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationClaudeModel: { findFirst: mocks.findFirstClaude },
      integrationDeepseekModel: { findFirst: mocks.findFirstDeepseek },
      integrationGeminiModel: { findFirst: mocks.findFirstGemini },
      integrationOpenaiModel: { findFirst: mocks.findFirstOpenai },
    },
    transaction: mocks.transaction,
    update: vi.fn(() => ({
      set: mocks.updateSet,
    })),
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

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { secretText: "secretText" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
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
])("$label connect", ({ findFirst, label, provider, service }) => {
  test("updates the existing row and audits action:update", async () => {
    findFirst.mockResolvedValue({ id: "existing-1" })

    await service.connect(connectProps)

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        model: connectProps.model,
        auth: { authType: "secretText", secretText: connectProps.apiKey },
      }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        detail: `updated the ${label} integration configuration`,
      }),
    )
  })

  test("inserts integration + provider row and audits action:connect when no row exists", async () => {
    findFirst.mockResolvedValue(undefined)

    await service.connect(connectProps)

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ integrationType: provider }),
    )
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        model: connectProps.model,
        auth: { authType: "secretText", secretText: connectProps.apiKey },
      }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "connect",
        detail: `connected a new ${label} integration`,
      }),
    )
  })
})

describe("OpenAI connect", () => {
  test("updates the existing row and audits with an explicit workspaceId", async () => {
    mocks.findFirstOpenai.mockResolvedValue({ id: "existing-1" })

    await integrationOpenAIService.connect(connectProps)

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ model: connectProps.model }),
    )
    // OpenAI dispatches with an explicit workspaceId (rather than relying on
    // this.audit()'s ALS actor) because connectOpenAIAction runs on
    // authActionClient, which never sets a workspaceId in the audit ALS.
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      workspaceId: connectProps.workspaceId,
      action: "update",
      detail: "updated the OpenAI integration configuration",
    })
  })

  test("inserts integration + provider row and audits connect with an explicit workspaceId", async () => {
    mocks.findFirstOpenai.mockResolvedValue(undefined)

    await integrationOpenAIService.connect(connectProps)

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ integrationType: "openai" }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      workspaceId: connectProps.workspaceId,
      action: "connect",
      detail: "connected a new OpenAI integration",
    })
  })
})
