import { beforeEach, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
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
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
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

const magicLinkService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  magicLinkService,
  resolveTenantSettings: vi.fn(async () => ({
    appUrl: "https://app.tenant.test",
  })),
}))

await import("@/features/magic-links/api/public")

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

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the magic links router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

test("list passes the token workspace, not a client-supplied one", async () => {
  magicLinkService.list.mockResolvedValueOnce({ data: [], pageCount: 0 })

  await findProcedure("GET", "/v1/magic-links").handler?.({
    context,
    input: { page: 1, perPage: 50, keyword: "promo", workspaceId: "ws-x" },
  })

  expect(magicLinkService.list).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: "workspace-1", keyword: "promo" }),
  )
})

test("get, update and delete are scoped to the token workspace", async () => {
  magicLinkService.findOrFail.mockResolvedValueOnce({ id: "1", name: "promo" })
  magicLinkService.update.mockResolvedValueOnce({ id: "1", name: "promo" })
  await findProcedure("GET", "/v1/magic-links/{id}").handler?.({
    context,
    input: { id: "1" },
  })
  await findProcedure("PATCH", "/v1/magic-links/{id}").handler?.({
    context,
    input: { id: "1", url: "https://example.com" },
  })
  await findProcedure("DELETE", "/v1/magic-links/{id}").handler?.({
    context,
    input: { id: "1" },
  })

  expect(magicLinkService.findOrFail).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    id: "1",
  })
  expect(magicLinkService.update).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    id: "1",
    data: { url: "https://example.com" },
  })
  expect(magicLinkService.delete).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    id: "1",
  })
})

test("create returns the created link", async () => {
  const created = { id: "1", name: "promo", url: "https://example.com" }
  magicLinkService.create.mockResolvedValueOnce(created)

  await expect(
    findProcedure("POST", "/v1/magic-links").handler?.({
      context,
      input: { name: "promo", url: "https://example.com" },
    }),
  ).resolves.toEqual({
    ...created,
    url: "https://app.tenant.test/r/workspace-1/promo",
  })
  expect(magicLinkService.create).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    data: { name: "promo", url: "https://example.com" },
  })
})
