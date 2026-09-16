import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { aiMCPServerModel: { findMany: mockFindMany } } },
}))

const { getMCPServerTools } = await import("../src/server/tools/mcp")

class TestMcpClient {
  readonly auth: { token?: string; type: string }

  constructor(props: {
    auth: { token?: string; type: string }
    name: string
    url: string
  }) {
    this.auth = props.auth
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
})

describe("getMCPServerTools token templates", () => {
  test("keeps static-token MCP tools compatible", async () => {
    mockFindMany.mockResolvedValue([
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
    mockFindMany.mockResolvedValue([
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
})
