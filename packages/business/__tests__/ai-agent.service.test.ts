import type { AIAgentModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockFindFirst,
  mockInsert,
  mockInvalidateCacheByTags,
  mockTransaction,
  mockUpdate,
  mockWithCache,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn()
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))
  const mockInsertValues = vi.fn()
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockDeleteWhere = vi.fn()
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  const dbClient = {
    delete: mockDelete,
    insert: mockInsert,
    query: {
      aiAgentModel: {
        findFirst: vi.fn(),
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

const { aiAgentService } = await import("../src/ai-agent/service")

const workspaceId = "workspace-1"
const workspaceCacheTag = `ai-agents:workspace:${workspaceId}`

const aiAgent = {
  id: "agent-1",
  workspaceId,
  isDefault: true,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockFindFirst.mockResolvedValue(aiAgent)
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
