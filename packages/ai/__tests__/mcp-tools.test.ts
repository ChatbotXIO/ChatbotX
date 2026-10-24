import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertSafeMcpEndpoint: vi.fn(),
  mockFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { aiMCPServerModel: { findMany: mocks.mockFindMany } } },
}))
vi.mock("@chatbotx.io/business", () => ({
  assertSafeMcpEndpoint: mocks.assertSafeMcpEndpoint,
}))

const { getMCPServerTools } = await import("../src/server/tools/mcp")

class TestMcpClient {
  static instances = 0
  readonly auth: { token?: string; type: string }

  constructor(props: {
    auth: { token?: string; type: string }
    name: string
    url: string
  }) {
    this.auth = props.auth
    TestMcpClient.instances += 1
  }

  listTools() {
    return Promise.resolve([])
  }

  callTool() {
    return Promise.resolve({ content: "ok", isError: false })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  TestMcpClient.instances = 0
  mocks.assertSafeMcpEndpoint.mockResolvedValue(undefined)
})

describe("getMCPServerTools token templates", () => {
  test("keeps static-token MCP tools compatible", async () => {
    mocks.mockFindMany.mockResolvedValue([
      {
        auth: { token: "static-token", type: "token" },
        availableTools: { search: { description: "Search" } },
        id: "mcp-1",
        name: "Search",
        selectedTools: ["search"],
        url: "https://mcp.example.test",
      },
    ])

    const result = await getMCPServerTools("workspace-1", ["mcp-1"], {
      McpClient: TestMcpClient,
      normalizeMcpContent: (content) => content,
    })

    expect(Object.keys(result.tools)).toEqual(["Search_search"])
    expect(result.clients).toHaveLength(1)
  })

  test("skips only the MCP server whose token cannot resolve", async () => {
    mocks.mockFindMany.mockResolvedValue([
      {
        auth: { token: "{{bot_field:42}}", type: "token" },
        availableTools: { privateSearch: { description: "Private" } },
        id: "mcp-private",
        name: "Private",
        selectedTools: ["privateSearch"],
        url: "https://private.example.test",
      },
      {
        auth: { type: "none" },
        availableTools: { publicSearch: { description: "Public" } },
        id: "mcp-public",
        name: "Public",
        selectedTools: ["publicSearch"],
        url: "https://public.example.test",
      },
    ])

    const result = await getMCPServerTools(
      "workspace-1",
      ["mcp-private", "mcp-public"],
      {
        McpClient: TestMcpClient,
        normalizeMcpContent: (content) => content,
        resolveToken: async () => ({
          reason: "missing",
          status: "unresolved",
        }),
      },
    )

    expect(Object.keys(result.tools)).toEqual(["Public_publicSearch"])
    expect(result.clients).toHaveLength(1)
  })

  test("does not resolve a token or construct a client for a blocked endpoint", async () => {
    mocks.mockFindMany.mockResolvedValue([
      {
        auth: { token: "{{bot_field:42}}", type: "token" },
        availableTools: { privateSearch: { description: "Private" } },
        id: "mcp-private",
        name: "Private",
        selectedTools: ["privateSearch"],
        url: "http://127.0.0.1:3000/mcp",
      },
    ])
    mocks.assertSafeMcpEndpoint.mockRejectedValue(new Error("blocked"))
    const resolveToken = vi.fn(async () => ({
      status: "resolved" as const,
      token: "secret",
    }))

    const result = await getMCPServerTools("workspace-1", ["mcp-private"], {
      McpClient: TestMcpClient,
      normalizeMcpContent: (content) => content,
      resolveToken,
    })

    expect(resolveToken).not.toHaveBeenCalled()
    expect(TestMcpClient.instances).toBe(0)
    expect(result.clients).toEqual([])
    expect(result.tools).toEqual({})
  })
})
