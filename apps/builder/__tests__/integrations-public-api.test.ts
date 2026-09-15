import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
  deprecated?: boolean
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
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
      handler: vi.fn((fn: (...args: any[]) => any) => {
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

class MockChatbotXException extends Error {
  code: string
  constructor(message: string, code = "systemError") {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: vi.fn(
    (message: string) => new MockChatbotXException(message, "notFound"),
  ),
  validationException: vi.fn(
    (_field: string, message: string) =>
      new MockChatbotXException(message, "validation"),
  ),
}))

const aiIntegrationService = {
  invalidateCache: vi.fn(),
}

vi.mock("@chatbotx.io/ai/server", () => ({ aiIntegrationService }))
vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: {
    enum: {
      claude: "claude",
      deepseek: "deepseek",
      gemini: "gemini",
      openai: "openai",
    },
  },
}))

const integrationService = {
  listByWorkspaceId: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findTokenRefreshErrorsByWorkspaceId: vi.fn(),
}

const integrationClaudeService = {
  findByWorkspaceId: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}
const integrationDeepSeekService = {
  findByWorkspaceId: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}
const integrationGeminiService = {
  findByWorkspaceId: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}
const integrationOpenAIService = {
  findByWorkspaceId: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  integrationService,
  integrationClaudeService,
  integrationDeepSeekService,
  integrationGeminiService,
  integrationOpenAIService,
}))

const connectionService = {
  disconnect: vi.fn(),
  connectFromCredentials: vi.fn(),
}
vi.mock("@chatbotx.io/connections", () => ({ connectionService }))

const connectionRepository = { findByProviderSourceId: vi.fn() }
vi.mock("@chatbotx.io/database/repositories", () => ({ connectionRepository }))

await import("@/features/integrations/api/public/crud")
await import("@/features/integrations/api/public/ai")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /v1/integrations", () => {
  const procedure = findProcedure("GET", "/v1/integrations")

  test("delegates to integrationService.listByWorkspaceId", async () => {
    integrationService.listByWorkspaceId.mockResolvedValueOnce([
      { id: "integration-1" },
    ])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(result).toEqual({ data: [{ id: "integration-1" }], pageCount: 1 })
    expect(integrationService.listByWorkspaceId).toHaveBeenCalledWith(
      "workspace-1",
    )
  })
})

describe("GET /v1/integrations/{id}", () => {
  const procedure = findProcedure("GET", "/v1/integrations/{id}")

  test("delegates to integrationService.findByIdForWorkspace", async () => {
    integrationService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "integration-1",
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "integration-1" },
    })

    expect(result).toEqual({ id: "integration-1" })
    expect(integrationService.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
    })
  })

  test("throws notFound when the integration does not exist", async () => {
    integrationService.findByIdForWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("Integration not found")
  })
})

describe("GET /v1/integrations/status/token-errors", () => {
  const procedure = findProcedure("GET", "/v1/integrations/status/token-errors")

  test("delegates to integrationService.findTokenRefreshErrorsByWorkspaceId", async () => {
    integrationService.findTokenRefreshErrorsByWorkspaceId.mockResolvedValueOnce(
      [{ id: "zalo-1", channel: "zalo", name: "Shop", error: "expired" }],
    )

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
    })

    expect(result).toEqual({
      data: [{ id: "zalo-1", channel: "zalo", name: "Shop", error: "expired" }],
    })
  })
})

describe("GET /v1/integrations/ai/{provider}", () => {
  const procedure = findProcedure("GET", "/v1/integrations/ai/{provider}")

  test("never returns the secret auth field", async () => {
    integrationClaudeService.findByWorkspaceId.mockResolvedValueOnce({
      id: "claude-1",
      model: "claude-opus",
      temperature: 0.4,
      maxOutputTokens: 1024,
      autoReply: true,
      auth: { authType: "secretText", secretText: "sk-real-secret-value" },
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "claude" },
    })

    expect(result).toEqual({
      id: "claude-1",
      model: "claude-opus",
      temperature: 0.4,
      maxOutputTokens: 1024,
      autoReply: true,
      hasApiKey: true,
    })
    expect(JSON.stringify(result)).not.toContain("sk-real-secret-value")
    expect(result).not.toHaveProperty("auth")
  })

  test("hasApiKey is false when no auth is stored", async () => {
    integrationClaudeService.findByWorkspaceId.mockResolvedValueOnce({
      id: "claude-1",
      model: "claude-opus",
      temperature: null,
      maxOutputTokens: 1024,
      autoReply: false,
      auth: null,
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "claude" },
    })

    expect(result).toMatchObject({ hasApiKey: false })
  })

  test("throws notFound when the provider is not connected", async () => {
    integrationClaudeService.findByWorkspaceId.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { provider: "claude" },
      }),
    ).rejects.toThrow("claude integration not found")
  })

  test("dispatches to the correct provider service", async () => {
    integrationOpenAIService.findByWorkspaceId.mockResolvedValueOnce({
      id: "openai-1",
      model: "gpt-5",
      temperature: 1,
      maxOutputTokens: 2048,
      autoReply: true,
      auth: { authType: "secretText", secretText: "sk-openai" },
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "openai" },
    })

    expect(integrationOpenAIService.findByWorkspaceId).toHaveBeenCalledWith(
      "workspace-1",
    )
    expect(integrationClaudeService.findByWorkspaceId).not.toHaveBeenCalled()
  })
})

describe("PUT /v1/integrations/ai/{provider}", () => {
  const procedure = findProcedure("PUT", "/v1/integrations/ai/{provider}")

  test("connects via connectionService.connectFromCredentials with allowUpdate, then returns the resource without the secret", async () => {
    connectionService.connectFromCredentials.mockResolvedValueOnce({
      id: "conn-1",
    })
    integrationGeminiService.findByWorkspaceId.mockResolvedValueOnce({
      id: "gemini-1",
      model: "gemini-3.5-flash",
      temperature: 0.4,
      maxOutputTokens: 1024,
      autoReply: false,
      auth: { authType: "secretText", secretText: "sk-gemini-secret" },
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        provider: "gemini",
        apiKey: "sk-gemini-secret",
        model: "gemini-3.5-flash",
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    })

    expect(connectionService.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      provider: "gemini",
      config: {
        apiKey: "sk-gemini-secret",
        model: "gemini-3.5-flash",
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
      allowUpdate: true,
    })
    expect(JSON.stringify(result)).not.toContain("sk-gemini-secret")
  })

  test("invalidates the AI integration cache after connecting", async () => {
    connectionService.connectFromCredentials.mockResolvedValueOnce({
      id: "conn-1",
    })
    integrationGeminiService.findByWorkspaceId.mockResolvedValueOnce({
      id: "gemini-1",
      model: "gemini-3.5-flash",
      temperature: 0.4,
      maxOutputTokens: 1024,
      autoReply: false,
      auth: { authType: "secretText", secretText: "sk-gemini-secret" },
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        provider: "gemini",
        apiKey: "sk-gemini-secret",
        model: "gemini-3.5-flash",
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    })

    expect(aiIntegrationService.invalidateCache).toHaveBeenCalledWith(
      "workspace-1",
      "gemini",
    )
  })

  test("propagates connectionCredentialsRejected without invalidating the cache", async () => {
    connectionService.connectFromCredentials.mockRejectedValueOnce(
      new MockChatbotXException(
        "Invalid Gemini API key",
        "connectionCredentialsRejected",
      ),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          provider: "gemini",
          apiKey: "bad-key",
          model: "gemini-3.5-flash",
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    ).rejects.toThrow()

    expect(aiIntegrationService.invalidateCache).not.toHaveBeenCalled()
  })

  test("is marked deprecated", () => {
    expect(procedure.route.deprecated).toBe(true)
  })
})

describe("DELETE /v1/integrations/ai/{provider}", () => {
  const procedure = findProcedure("DELETE", "/v1/integrations/ai/{provider}")

  test("resolves the Connection by (workspaceId, provider, 'workspace') and disconnects through connectionService", async () => {
    connectionRepository.findByProviderSourceId.mockResolvedValueOnce({
      id: "conn-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "deepseek" },
    })

    expect(connectionRepository.findByProviderSourceId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      provider: "deepseek",
      sourceId: "workspace",
    })
    expect(connectionService.disconnect).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "workspace-1",
    })
  })

  test("no-ops the disconnect call (idempotent) when no Connection row exists yet", async () => {
    connectionRepository.findByProviderSourceId.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "deepseek" },
    })

    expect(connectionService.disconnect).not.toHaveBeenCalled()
  })

  test("invalidates the AI integration cache after disconnecting", async () => {
    connectionRepository.findByProviderSourceId.mockResolvedValueOnce({
      id: "conn-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "deepseek" },
    })

    expect(aiIntegrationService.invalidateCache).toHaveBeenCalledWith(
      "workspace-1",
      "deepseek",
    )
  })

  test("invalidates the cache even when there was nothing to disconnect", async () => {
    connectionRepository.findByProviderSourceId.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { provider: "deepseek" },
    })

    expect(aiIntegrationService.invalidateCache).toHaveBeenCalledWith(
      "workspace-1",
      "deepseek",
    )
  })

  test("responds with 204 (no body)", () => {
    expect(procedure.route.successStatus).toBe(204)
  })

  test("is marked deprecated", () => {
    expect(procedure.route.deprecated).toBe(true)
  })
})
