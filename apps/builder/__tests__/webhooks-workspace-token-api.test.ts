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
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPI, capturedProcedures } = vi.hoisted(() => {
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

  return {
    workspaceTokenAuthAPI: {
      route: vi.fn((config: RouteConfig) => makeProcedure(config)),
    },
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))

const webhookService = {
  listByWorkspaceId: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ webhookService }))

vi.mock("@chatbotx.io/database/schema", () => ({
  createSelectSchema: vi.fn(() => ({})),
  webhookModel: {},
}))

await import("@/features/webhooks/api/workspace-token")

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

describe("GET /v1/webhooks", () => {
  const procedure = findProcedure("GET", "/v1/webhooks")

  test("route metadata", () => {
    expect(procedure.route).toEqual(
      expect.objectContaining({ method: "GET", path: "/v1/webhooks" }),
    )
  })

  test("delegates to webhookService.listByWorkspaceId", async () => {
    webhookService.listByWorkspaceId.mockResolvedValueOnce([
      { id: "webhook-1" },
    ])

    await expect(
      procedure.handler?.({ context: { workspace: { id: "workspace-1" } } }),
    ).resolves.toEqual({ data: [{ id: "webhook-1" }] })

    expect(webhookService.listByWorkspaceId).toHaveBeenCalledWith("workspace-1")
  })
})

describe("POST /v1/webhooks", () => {
  const procedure = findProcedure("POST", "/v1/webhooks")

  test("route metadata", () => {
    expect(procedure.route).toEqual(
      expect.objectContaining({
        method: "POST",
        path: "/v1/webhooks",
        successStatus: 201,
      }),
    )
  })

  test("maps conditions and delegates to webhookService.register", async () => {
    webhookService.register.mockResolvedValueOnce({ id: "webhook-1" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        name: "n8n trigger",
        url: "https://n8n.example.com/webhook/abc",
        conditions: [
          { type: "newContact" },
          { type: "tagApplied", sourceId: "tag-1" },
        ],
      },
    })

    expect(result).toEqual({ id: "webhook-1" })
    expect(webhookService.register).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "n8n trigger",
      url: "https://n8n.example.com/webhook/abc",
      conditions: [
        { type: "newContact", sourceId: null, operator: null, value: null },
        {
          type: "tagApplied",
          sourceId: "tag-1",
          operator: null,
          value: null,
        },
      ],
    })
  })
})

describe("DELETE /v1/webhooks/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/webhooks/{id}")

  test("route metadata", () => {
    expect(procedure.route).toEqual(
      expect.objectContaining({
        method: "DELETE",
        path: "/v1/webhooks/{id}",
        successStatus: 204,
      }),
    )
  })

  test("delegates to webhookService.unregister", async () => {
    webhookService.unregister.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "webhook-1" },
    })

    expect(webhookService.unregister).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "webhook-1",
    })
  })
})
