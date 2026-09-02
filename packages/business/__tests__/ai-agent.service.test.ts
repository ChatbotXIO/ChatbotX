import type { AIAgentModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockFindFirst,
  mockFindMany,
  mockInsert,
  mockInvalidateCacheByTags,
  mockTransaction,
  mockUpdate,
  mockWithCache,
  mockTemplateInstalledResourceFindMany,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn()
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))
  const mockInsertValues = vi.fn()
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockDeleteWhere = vi.fn()
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockTemplateInstalledResourceFindMany = vi.fn(async () => [])

  const dbClient = {
    delete: mockDelete,
    insert: mockInsert,
    query: {
      aiAgentModel: {
        findFirst: vi.fn(),
        findMany: vi.fn(async () => []),
      },
      templateInstalledResourceModel: {
        findMany: mockTemplateInstalledResourceFindMany,
      },
    },
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(dbClient),
    ),
    update: mockUpdate,
  }

  return {
    mockDelete,
    mockFindFirst: dbClient.query.aiAgentModel.findFirst,
    mockFindMany: dbClient.query.aiAgentModel.findMany,
    mockInsert,
    mockInvalidateCacheByTags: vi.fn(),
    mockTransaction: dbClient.transaction,
    mockUpdate,
    mockWithCache: vi.fn(
      async (
        _key: string,
        callback: () => Promise<unknown> | unknown,
        _options: { ttl: number; tags: string[] },
      ) => callback(),
    ),
    mockTemplateInstalledResourceFindMany,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    delete: mockDelete,
    insert: mockInsert,
    query: {
      aiAgentModel: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
      templateInstalledResourceModel: {
        findMany: mockTemplateInstalledResourceFindMany,
      },
    },
    transaction: mockTransaction,
    update: mockUpdate,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiAgentModel: {
    id: "id",
    workspaceId: "workspaceId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mockInvalidateCacheByTags,
  withCache: mockWithCache,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "agent-1",
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const { aiAgentService } = await import("../src/ai-agent/service")

const workspaceId = "workspace-1"
const workspaceCacheTag = `ai-agents:workspace:${workspaceId}`

const aiAgent = {
  id: "agent-1",
  workspaceId,
  isDefault: true,
  name: "Support agent",
  prompt: "Help customers",
  messages: [],
  models: [{ provider: "openai", model: "gpt-4o" }],
  temperature: 0.7,
  maxOutputTokens: 1000,
  tools: ["file:knowledge-1"],
  webSearchAuthorizedDomains: [],
  isRichResponse: false,
} as AIAgentModel

const createRequest = {
  isDefault: false,
  isRichResponse: false,
  maxOutputTokens: 1000,
  messages: [],
  models: [],
  name: "Support agent",
  prompt: "Help customers",
  temperature: 0.7,
  tools: [],
}

function lastAuditDetail(): string {
  const lastCall = dispatchAuditRecord.mock.calls.at(-1)
  return lastCall?.[0]?.detail
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindFirst.mockResolvedValue(aiAgent)
  mockFindMany.mockResolvedValue([aiAgent])
})

describe("aiAgentService.findDefault", () => {
  test("returns the cached default AI agent with the workspace cache tag", async () => {
    await expect(aiAgentService.findDefault(workspaceId)).resolves.toBe(aiAgent)

    expect(mockWithCache).toHaveBeenCalledWith(
      "ai-agents:default:workspace-1",
      expect.any(Function),
      {
        ttl: 300,
        tags: [workspaceCacheTag],
      },
    )
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        isDefault: true,
        workspaceId,
      },
    })
  })

  test("returns undefined when the workspace has no default AI agent", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      aiAgentService.findDefault(workspaceId),
    ).resolves.toBeUndefined()
  })
})

describe("aiAgentService cache invalidation", () => {
  test("create invalidates the same workspace tag used by findDefault", async () => {
    await aiAgentService.create(workspaceId, createRequest)

    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([workspaceCacheTag])
  })

  test("updateAIAgent invalidates the same workspace tag used by findDefault", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      { name: "Updated" },
    )

    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([workspaceCacheTag])
  })

  test("delete invalidates the same workspace tag used by findDefault", async () => {
    await aiAgentService.delete({ ids: ["agent-1"], workspaceId })

    expect(mockInvalidateCacheByTags).toHaveBeenCalledWith([workspaceCacheTag])
  })
})

describe("aiAgentService audit messages", () => {
  test("create logs by id", async () => {
    await aiAgentService.create(workspaceId, createRequest)

    expect(lastAuditDetail()).toBe("created a new AI Agent (#agent-1)")
  })

  test("delete logs one entry per agent by id", async () => {
    mockFindMany.mockResolvedValue([{ id: "agent-1" }, { id: "agent-2" }])

    await aiAgentService.delete({ ids: ["agent-1", "agent-2"], workspaceId })

    expect(dispatchAuditRecord).toHaveBeenCalledTimes(2)
    expect(dispatchAuditRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ detail: "deleted an AI Agent (#agent-1)" }),
    )
    expect(dispatchAuditRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ detail: "deleted an AI Agent (#agent-2)" }),
    )
  })

  test("update: isDefault-only true logs set as default", async () => {
    mockFindFirst.mockResolvedValue({ ...aiAgent, isDefault: false })

    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      { isDefault: true },
    )

    expect(lastAuditDetail()).toBe("set as default an AI Agent (#agent-1)")
  })

  test("update: isDefault-only false logs unset default", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      { isDefault: false },
    )

    expect(lastAuditDetail()).toBe("unset default an AI Agent (#agent-1)")
  })

  test("update: isDefault-only resubmitting the current value does not audit", async () => {
    // Base fixture is already isDefault: true — re-submitting `true` (e.g. a
    // double-click on "Set as default") must not create a duplicate row.
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      { isDefault: true },
    )

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("update: model-only change", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: [{ provider: "openai", model: "gpt-5" }],
        prompt: aiAgent.prompt,
        tools: aiAgent.tools,
      },
    )

    expect(lastAuditDetail()).toBe("updated the AI Agent model (#agent-1)")
  })

  test("update: instructions-only change", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: "New instructions",
        tools: aiAgent.tools,
      },
    )

    expect(lastAuditDetail()).toBe(
      "updated the AI Agent instructions (#agent-1)",
    )
  })

  test("update: knowledge-base-only change", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: aiAgent.prompt,
        tools: ["file:knowledge-2"],
      },
    )

    expect(lastAuditDetail()).toBe(
      "updated the AI Agent knowledge base (#agent-1)",
    )
  })

  test("update: model + instructions change", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: [{ provider: "openai", model: "gpt-5" }],
        prompt: "New instructions",
        tools: aiAgent.tools,
      },
    )

    expect(lastAuditDetail()).toBe(
      "updated the AI Agent model and instructions (#agent-1)",
    )
  })

  test("update: model + knowledge base change (no instructions)", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: [{ provider: "openai", model: "gpt-5" }],
        prompt: aiAgent.prompt,
        tools: ["file:knowledge-2"],
      },
    )

    expect(lastAuditDetail()).toBe(
      "updated the AI Agent model and knowledge base (#agent-1)",
    )
  })

  test("update: instructions + knowledge base change (no model)", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: "New instructions",
        tools: ["file:knowledge-2"],
      },
    )

    expect(lastAuditDetail()).toBe(
      "updated the AI Agent instructions and knowledge base (#agent-1)",
    )
  })

  test("update: model + instructions + knowledge base change", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: [{ provider: "openai", model: "gpt-5" }],
        prompt: "New instructions",
        tools: ["file:knowledge-2"],
      },
    )

    expect(lastAuditDetail()).toBe(
      "updated the AI Agent model, instructions and knowledge base (#agent-1)",
    )
  })

  test("update: messages-only change falls back to generic message", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: aiAgent.prompt,
        tools: aiAgent.tools,
        messages: [{ role: "user", content: "Hi" }],
      },
    )

    expect(lastAuditDetail()).toBe("updated an AI Agent (#agent-1)")
  })

  test("update: other field change (e.g. name) falls back to generic message", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: aiAgent.prompt,
        tools: aiAgent.tools,
        name: "Renamed agent",
      },
    )

    expect(lastAuditDetail()).toBe("updated an AI Agent (#agent-1)")
  })

  test("update: unchanged payload does not audit", async () => {
    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: aiAgent.prompt,
        tools: aiAgent.tools,
        name: aiAgent.name,
        temperature: aiAgent.temperature,
        maxOutputTokens: aiAgent.maxOutputTokens,
        isRichResponse: aiAgent.isRichResponse,
        messages: aiAgent.messages,
      },
    )

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("update: reordering file tools does not count as a knowledge base change", async () => {
    mockFindFirst.mockResolvedValue({
      ...aiAgent,
      tools: ["file:a", "file:b"],
    })

    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: aiAgent.prompt,
        tools: ["file:b", "file:a"],
      },
    )

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("update: does not flag models as changed when only jsonb key order differs", async () => {
    mockFindFirst.mockResolvedValue({
      ...aiAgent,
      // Simulates Postgres jsonb, which does not preserve object key order.
      models: [{ model: "gpt-4o", provider: "openai" }],
    })

    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: [{ provider: "openai", model: "gpt-4o" }],
        prompt: aiAgent.prompt,
        tools: aiAgent.tools,
      },
    )

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("update: does not flag messages as changed when only jsonb key order differs", async () => {
    mockFindFirst.mockResolvedValue({
      ...aiAgent,
      messages: [{ content: "Hi", role: "user" }],
    })

    await aiAgentService.updateAIAgent(
      { id: "agent-1", workspaceId },
      {
        ...createRequest,
        models: aiAgent.models,
        prompt: aiAgent.prompt,
        tools: aiAgent.tools,
        messages: [{ role: "user", content: "Hi" }],
      },
    )

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})
