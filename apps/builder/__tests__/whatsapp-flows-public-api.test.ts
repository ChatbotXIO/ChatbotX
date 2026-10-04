// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    orpcMock: { workspaceTokenAuthAPIForScope: () => api },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  findIntegration: vi.fn(),
  screens: vi.fn(),
  sync: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  whatsappFlowService: { list: mocks.list },
  integrationWhatsappService: { findByIdForWorkspace: mocks.findIntegration },
}))
vi.mock(
  "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations",
  () => ({
    getWhatsappFlowScreens: mocks.screens,
    syncWhatsappFlows: mocks.sync,
  }),
)
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/integration-whatsapp/flows/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }

describe("WhatsApp Flows routes", () => {
  test("list is scoped to the token's workspace and drops the integration row", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "1",
        name: "Survey",
        sourceId: "meta-1",
        status: "PUBLISHED",
        categories: [],
        validationErrors: [],
        completedCount: "0",
        integrationWhatsappId: "3",
        screens: [],
        integrationWhatsapp: { id: "3", auth: { token: "secret" } },
      },
    ])

    const result = await find(
      "GET",
      "/v1/whatsapp/flows",
    )?.({
      context,
      input: { integrationWhatsappId: "3" },
    })

    expect(mocks.list).toHaveBeenCalledWith({
      where: { integrationWhatsappId: "3", workspaceId: "ws-1" },
    })
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  test("screens and sync use the token's workspace", async () => {
    mocks.screens.mockResolvedValue([])
    mocks.findIntegration.mockResolvedValueOnce({ id: "3" })

    await find(
      "GET",
      "/v1/whatsapp/flows/{flowId}/screens",
    )?.({
      context,
      input: { flowId: "9" },
    })
    await find(
      "POST",
      "/v1/whatsapp-channels/{id}/sync-flows",
    )?.({
      context,
      input: { id: "3" },
    })

    expect(mocks.screens).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "9",
    })
    expect(mocks.sync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationWhatsapp: { id: "3" },
    })
  })

  test("sync on a number of another workspace is a 404", async () => {
    mocks.sync.mockClear()
    mocks.findIntegration.mockResolvedValueOnce(undefined)

    await expect(
      find(
        "POST",
        "/v1/whatsapp-channels/{id}/sync-flows",
      )?.({
        context,
        input: { id: "foreign" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.sync).not.toHaveBeenCalled()
  })
})
