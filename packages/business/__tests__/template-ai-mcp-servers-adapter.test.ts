// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  existingNames: [] as string[],
  locks: [] as unknown[],
  findMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { aiMCPServerModel: { findMany: mocks.findMany } } },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join("?"),
    values,
  }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  aiMCPServerModel: { table: "mcp" },
}))
let counter = 0
vi.mock("@chatbotx.io/utils", () => ({ createId: () => `new-${++counter}` }))

const { aiMcpServersAdapter, stripUrlSecrets } = await import(
  "../src/template/adapters/ai-mcp-servers"
)

const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "src-1",
  name: "Docs search",
  url: "https://mcp.example.com/sse",
  urlHadSecret: false,
  authType: "none",
  headerNames: [],
  availableTools: { search: {} },
  selectedTools: ["search"],
  ...overrides,
})

const install = async (entries: Record<string, unknown>[]) => {
  const warnings: { entityKind: string; value: string }[] = []
  const tracked: Record<string, unknown>[] = []
  const ctx = {
    tx: {
      execute: (query: unknown) => {
        mocks.locks.push(query)
        return Promise.resolve()
      },
      query: {
        aiMCPServerModel: {
          findMany: () =>
            Promise.resolve(mocks.existingNames.map((name) => ({ name }))),
        },
      },
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          mocks.inserted.push(values)
          return Promise.resolve()
        },
      }),
    },
    workspaceId: "ws-1",
    idMaps: {} as Record<string, Map<string, string>>,
    track: (e: Record<string, unknown>) => tracked.push(e),
    warn: (w: { entityKind: string; value: string }) => warnings.push(w),
  }
  await aiMcpServersAdapter.insert(ctx as never, entries as never)
  return { ctx, warnings, tracked }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inserted.length = 0
  mocks.existingNames = []
  mocks.locks.length = 0
})

describe("stripUrlSecrets", () => {
  test.each([
    ["https://mcp.example.com", "https://mcp.example.com/", false],
    ["https://mcp.example.com/", "https://mcp.example.com/", false],
    // Only the origin ships: a path can itself be the credential.
    [
      "https://mcp.zapier.com/api/mcp/s/SECRETKEY/mcp",
      "https://mcp.zapier.com/",
      true,
    ],
    ["https://mcp.example.com/sse", "https://mcp.example.com/", true],
    [
      "https://mcp.example.com/sse?api_key=abc",
      "https://mcp.example.com/",
      true,
    ],
    ["https://user:pw@mcp.example.com/sse", "https://mcp.example.com/", true],
    ["https://mcp.example.com/#token", "https://mcp.example.com/", true],
    ["https://mcp.example.com:8443/x", "https://mcp.example.com:8443/", true],
  ])("%s", (input, url, hadSecret) => {
    expect(stripUrlSecrets(input)).toEqual({ url, hadSecret })
  })

  test("a value that is not a URL ships nothing", () => {
    expect(stripUrlSecrets("not a url")).toEqual({ url: "", hadSecret: true })
  })
})

describe("ai MCP servers adapter: install", () => {
  test("installs without credentials and asks for them when the source had one", async () => {
    const { ctx, warnings, tracked } = await install([
      entry({ authType: "header", headerNames: ["X-Api-Key", "X-Org"] }),
    ])

    expect(mocks.inserted[0]).toMatchObject({
      workspaceId: "ws-1",
      auth: { type: "none" },
      url: "https://mcp.example.com/sse",
      selectedTools: ["search"],
    })
    expect(warnings).toEqual([
      expect.objectContaining({
        entityKind: "credentialRequired",
        value: "X-Api-Key, X-Org",
      }),
    ])
    expect(ctx.idMaps.aiMcpServer.get("src-1")).toBe(mocks.inserted[0].id)
    expect(tracked).toEqual([
      expect.objectContaining({
        resourceKind: "aiMcpServer",
        sourceResourceId: "src-1",
        wasExisting: false,
      }),
    ])
  })

  test("a server that needed no credential installs silently", async () => {
    const { warnings } = await install([entry()])

    expect(warnings).toEqual([])
  })

  test("a URL that had a secret in it is flagged even with no auth", async () => {
    const { warnings } = await install([entry({ urlHadSecret: true })])

    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "credentialRequired" }),
    ])
  })

  test("a taken name gets a copy suffix instead of failing", async () => {
    mocks.existingNames = ["Docs search"]

    await install([entry(), entry({ sourceId: "src-2" })])

    expect(mocks.inserted.map((row) => row.name)).toEqual(
      ["Docs search - Copy", "Docs search"]
        .slice(0, 1)
        .concat(["Docs search - Copy 2"]),
    )
  })

  test("serialises the name check per workspace before reading names", async () => {
    await install([entry()])

    expect(mocks.locks).toHaveLength(1)
    expect(JSON.stringify(mocks.locks[0])).toContain("mcp-name:ws-1")
  })

  test("installs nothing and queries nothing for an empty list", async () => {
    await install([])

    expect(mocks.inserted).toEqual([])
  })
})

describe("ai MCP servers adapter: collect", () => {
  test("never ships a token or a header value, only the header names", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "s1",
        name: "A",
        url: "https://mcp.zapier.com/api/mcp/s/PATH-SECRET/mcp?key=SECRET",
        auth: { type: "token", token: "TOP-SECRET" },
        availableTools: {},
        selectedTools: [],
      },
      {
        id: "s2",
        name: "B",
        url: "https://mcp.example.com/b",
        auth: {
          type: "header",
          headers: [{ header: "X-Api-Key", value: "HEADER-SECRET" }],
        },
        availableTools: {},
        selectedTools: [],
      },
    ])

    const result = await aiMcpServersAdapter.collector.collect("ws-1", [
      "s1",
      "s2",
    ])

    const shipped = JSON.stringify(result.entries)
    expect(shipped).not.toContain("TOP-SECRET")
    expect(shipped).not.toContain("HEADER-SECRET")
    expect(shipped).not.toContain("SECRET")
    expect(shipped).not.toContain("PATH-SECRET")
    expect(result.entries).toEqual([
      expect.objectContaining({
        authType: "token",
        headerNames: [],
        urlHadSecret: true,
        url: "https://mcp.zapier.com/",
      }),
      expect.objectContaining({
        authType: "header",
        headerNames: ["X-Api-Key"],
        urlHadSecret: true,
      }),
    ])
  })
})
