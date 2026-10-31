// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { aiAgentModel: { findMany: mocks.findMany } } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({ aiAgentModel: {} }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createId: () => "new",
}))

const { aiAgentsAdapter } = await import("../src/template/adapters/ai-agents")

const agent = (id: string, tools: string[]) => ({
  id,
  name: id,
  prompt: null,
  messages: [],
  models: [],
  temperature: 0,
  maxOutputTokens: 100,
  tools,
  isDefault: false,
  isRichResponse: false,
  webSearchAuthorizedDomains: [],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ai agents collector: MCP servers", () => {
  test("an agent's mcp and file tools pull in their servers and files once each", async () => {
    mocks.findMany.mockResolvedValue([
      agent("a1", ["mcp:m1", "fn:f1", "file:x", "mcp:m2"]),
      agent("a2", ["mcp:m1"]),
    ])

    const result = await aiAgentsAdapter.collector.collect("ws-1", ["a1", "a2"])

    expect(result.hardDependencies).toEqual([
      { category: "aiMcpServers", sourceId: "m1" },
      { category: "aiMcpServers", sourceId: "m2" },
      { category: "aiFiles", sourceId: "x" },
    ])
  })

  test("an agent with no MCP tools has no dependencies", async () => {
    mocks.findMany.mockResolvedValue([agent("a1", ["fn:f1"])])

    const result = await aiAgentsAdapter.collector.collect("ws-1", ["a1"])

    expect(result.hardDependencies).toEqual([])
  })
})
