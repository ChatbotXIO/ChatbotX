import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedHandler = (args: {
  context: { workspace: { id: string } }
  input: unknown
}) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
}

const {
  workspaceTokenAuthAPIForScope,
  workspaceTokenAdminAPI,
  capturedProcedures,
} = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: CapturedHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }
  const workspaceTokenAuthAPIForScope = vi.fn(
    (_scope: string) => workspaceTokenAuthAPI,
  )

  return {
    workspaceTokenAuthAPIForScope,
    workspaceTokenAdminAPI: workspaceTokenAuthAPIForScope("workspace"),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({
  workspaceTokenAuthAPIForScope,
  workspaceTokenAdminAPI,
}))

const workspaceApiTokenService = {
  listTokens: vi.fn(),
  findTokenOrFail: vi.fn(),
  createToken: vi.fn(),
  updateToken: vi.fn(),
  rotateToken: vi.fn(),
  deleteToken: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ workspaceApiTokenService }))

const generateWorkspaceToken = vi.fn()
vi.mock("@chatbotx.io/business/workspace-api-token/credentials", () => ({
  generateWorkspaceToken,
}))

const toPublicWorkspaceApiToken = vi.fn((token: Record<string, unknown>) => ({
  id: token.id,
  name: token.name,
  permission: token.permission,
  tokenPrefix: token.tokenPrefix,
  isDefault: token.isDefault,
  scopes: token.scopes,
  createdAt: token.createdAt,
}))
vi.mock("@/features/workspaces/schema/public", () => ({
  createWorkspaceApiTokenPublicRequest: z.object({}),
  createWorkspaceApiTokenPublicResponse: z.object({}),
  getWorkspaceApiTokenPublicRequest: z.object({}),
  toPublicWorkspaceApiToken,
  updateWorkspaceApiTokenPublicRequest: z.object({}),
  workspaceApiTokenPublicResource: z.object({}),
}))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnCreatingWorkspaceApiToken: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnMutatingWorkspaceApiToken: {},
}))

await import("@/features/workspaces/api/public/api-tokens")
const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const adminRouteCountAtImport = workspaceTokenAdminAPI.route.mock.calls.length

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const context = { workspace: { id: "workspace-1" } }
const API_TOKEN = {
  id: "1",
  name: "Managed token",
  permission: "full",
  tokenPrefix: "cbx_ws_man",
  isDefault: false,
  scopes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the API-token public router under the unrestricted workspace administration scope", () => {
  expect(scopeArgAtImport).toBe("workspace")
  expect(adminRouteCountAtImport).toBe(6)
})

describe("GET /v1/api-tokens", () => {
  const procedure = findProcedure("GET", "/v1/api-tokens")

  test("lists tokens in the authenticated workspace", async () => {
    workspaceApiTokenService.listTokens.mockResolvedValueOnce([API_TOKEN])

    await expect(
      procedure.handler?.({ context, input: { page: 1, perPage: 50 } }),
    ).resolves.toEqual({ data: [API_TOKEN], pageCount: 1 })

    expect(workspaceApiTokenService.listTokens).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })
})

describe("GET /v1/api-tokens/{id}", () => {
  const procedure = findProcedure("GET", "/v1/api-tokens/{id}")

  test("gets a token scoped to the authenticated workspace", async () => {
    workspaceApiTokenService.findTokenOrFail.mockResolvedValueOnce(API_TOKEN)

    await expect(
      procedure.handler?.({ context, input: { id: "1" } }),
    ).resolves.toEqual(API_TOKEN)

    expect(workspaceApiTokenService.findTokenOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "1",
    })
  })
})

describe("POST /v1/api-tokens", () => {
  const procedure = findProcedure("POST", "/v1/api-tokens")

  test("creates a token with server-generated credentials in the authenticated workspace", async () => {
    const credentials = {
      token: "cbx_ws_created_plaintext",
      tokenHash: "created-hash",
      tokenPrefix: "cbx_ws_crea",
    }
    generateWorkspaceToken.mockResolvedValueOnce(credentials)
    workspaceApiTokenService.createToken.mockResolvedValueOnce(API_TOKEN)

    await expect(
      procedure.handler?.({
        context,
        input: {
          name: "Created token",
          permission: "read_only",
          scopes: ["contacts"],
        },
      }),
    ).resolves.toEqual({ apiToken: API_TOKEN, token: credentials.token })

    expect(workspaceApiTokenService.createToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Created token",
      permission: "read_only",
      scopes: ["contacts"],
      tokenHash: "created-hash",
      tokenPrefix: "cbx_ws_crea",
    })
  })
})

describe("PATCH /v1/api-tokens/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/api-tokens/{id}")

  test("updates only the submitted fields in the authenticated workspace", async () => {
    const updatedToken = { ...API_TOKEN, name: "Renamed token" }
    workspaceApiTokenService.updateToken.mockResolvedValueOnce(updatedToken)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "1", name: "Renamed token" },
      }),
    ).resolves.toEqual(updatedToken)

    expect(workspaceApiTokenService.updateToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "1",
      name: "Renamed token",
    })
  })
})

describe("POST /v1/api-tokens/{id}/rotate", () => {
  const procedure = findProcedure("POST", "/v1/api-tokens/{id}/rotate")

  test("returns the newly generated plaintext token instead of a prior credential", async () => {
    const previousToken = "cbx_ws_previous_plaintext"
    const credentials = {
      token: "cbx_ws_rotated_plaintext",
      tokenHash: "rotated-hash",
      tokenPrefix: "cbx_ws_rota",
    }
    generateWorkspaceToken.mockResolvedValueOnce(credentials)
    workspaceApiTokenService.rotateToken.mockResolvedValueOnce(API_TOKEN)

    await expect(
      procedure.handler?.({ context, input: { id: "1" } }),
    ).resolves.toEqual({ apiToken: API_TOKEN, token: credentials.token })

    expect(workspaceApiTokenService.rotateToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "1",
      tokenHash: "rotated-hash",
      tokenPrefix: "cbx_ws_rota",
    })
    expect(credentials.token).not.toBe(previousToken)
  })
})

describe("DELETE /v1/api-tokens/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/api-tokens/{id}")

  test("rejects a default token before calling deleteToken", async () => {
    workspaceApiTokenService.findTokenOrFail.mockResolvedValueOnce({
      ...API_TOKEN,
      isDefault: true,
    })

    await expect(
      procedure.handler?.({ context, input: { id: "1" } }),
    ).rejects.toMatchObject({ code: "workspaceApiTokenImmutable" })

    expect(workspaceApiTokenService.deleteToken).not.toHaveBeenCalled()
  })

  test("deletes a non-default token in the authenticated workspace", async () => {
    workspaceApiTokenService.findTokenOrFail.mockResolvedValueOnce(API_TOKEN)
    workspaceApiTokenService.deleteToken.mockResolvedValueOnce(true)

    await expect(
      procedure.handler?.({ context, input: { id: "1" } }),
    ).resolves.toBeUndefined()

    expect(workspaceApiTokenService.deleteToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "1",
    })
  })
})
