import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

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

const botFieldService = {
  list: vi.fn(),
  create: vi.fn(),
  findByKeyOrFail: vi.fn(),
  updateByKey: vi.fn(),
  bulkUpdateByKeys: vi.fn(),
  deleteByKey: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ botFieldService }))

await import("@/features/bot-fields/api/public")

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

const tokenContext = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PUT /v1/bot-fields", () => {
  const procedure = findProcedure("PUT", "/v1/bot-fields")

  test("resolves each entry addressed by id", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { fields: [{ id: 123, value: "pro" }] },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [{ key: "123", value: "pro" }],
    })
  })

  test("resolves each entry addressed by name", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { fields: [{ name: "plan", value: "pro" }] },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [{ key: "plan", value: "pro" }],
    })
  })

  test("accepts the legacy `key` shape for backward compatibility", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { fields: [{ key: "plan", value: "pro" }] },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [{ key: "plan", value: "pro" }],
    })
  })

  test("resolves a mixed batch of id, name, and legacy key entries in order", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: {
        fields: [
          { id: 1, value: "a" },
          { name: "plan", value: "b" },
          { key: "legacy-field", value: "c" },
        ],
      },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [
        { key: "1", value: "a" },
        { key: "plan", value: "b" },
        { key: "legacy-field", value: "c" },
      ],
    })
  })
})
