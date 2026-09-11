import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: ProcedureHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const aiMcpServerService = {
  listAIMcpServers: vi.fn(),
  findBy: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ aiMcpServerService }))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    aiMCPServerModel: {},
  }
})

// Deferred until after `vi.mock` calls above are hoisted, so the router
// module picks up the mocked `@/orpc`/`@chatbotx.io/business` bindings.
await import("@/features/ai-mcp-servers/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the ai-mcp-servers public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ai-mcp-servers", () => {
  const procedure = findProcedure("GET", "/v1/ai-mcp-servers")

  test("delegates to aiMcpServerService.listAIMcpServers", async () => {
    aiMcpServerService.listAIMcpServers.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(aiMcpServerService.listAIMcpServers).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/ai-mcp-servers/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ai-mcp-servers/{id}")

  test("delegates to aiMcpServerService.findBy", async () => {
    aiMcpServerService.findBy.mockResolvedValueOnce({ id: "mcp-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "mcp-1" },
    })

    expect(aiMcpServerService.findBy).toHaveBeenCalledWith({
      where: { id: "mcp-1", workspaceId: "workspace-1" },
    })
  })

  test("throws not found when the mcp server does not exist", async () => {
    aiMcpServerService.findBy.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("AI MCP server not found")
  })
})

describe("POST /v1/ai-mcp-servers", () => {
  const procedure = findProcedure("POST", "/v1/ai-mcp-servers")

  test("delegates to aiMcpServerService.create and returns the created row", async () => {
    aiMcpServerService.create.mockResolvedValueOnce([{ id: "mcp-1" }])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Docs MCP" },
    })

    expect(aiMcpServerService.create).toHaveBeenCalledWith("workspace-1", {
      name: "Docs MCP",
    })
    expect(result).toEqual({ id: "mcp-1" })
  })
})

describe("PUT /v1/ai-mcp-servers/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ai-mcp-servers/{id}")

  test("delegates to aiMcpServerService.update and returns its result", async () => {
    aiMcpServerService.update.mockResolvedValueOnce([{ id: "mcp-1" }])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "mcp-1", name: "Renamed" },
    })

    expect(aiMcpServerService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "mcp-1" },
      { name: "Renamed" },
    )
    expect(result).toEqual({ id: "mcp-1" })
  })

  test("throws not found when the mcp server does not exist", async () => {
    aiMcpServerService.update.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing", name: "Renamed" },
      }),
    ).rejects.toThrow("AI MCP server not found")
  })
})

describe("DELETE /v1/ai-mcp-servers/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ai-mcp-servers/{id}")

  test("delegates to aiMcpServerService.delete", async () => {
    aiMcpServerService.delete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "mcp-1" },
    })

    expect(aiMcpServerService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "mcp-1",
    })
  })
})
