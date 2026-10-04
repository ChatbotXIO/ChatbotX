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
  findTemplate: vi.fn(),
  findIntegration: vi.fn(),
  sync: vi.fn(),
  searchProducts: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  whatsappMessageTemplateService: {
    list: vi.fn(),
    findByIdForWorkspace: mocks.findTemplate,
  },
  integrationWhatsappService: { findByIdForWorkspace: mocks.findIntegration },
  integrationMetaCatalogService: {
    searchProductsForSend: mocks.searchProducts,
  },
}))
vi.mock(
  "@/features/integration-whatsapp/message-templates/lib/sync-whatsapp-templates",
  () => ({ syncWhatsappMessageTemplates: mocks.sync }),
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

await import("@/features/integration-whatsapp/message-templates/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }

describe("WhatsApp template extras", () => {
  test("get resolves the template inside the workspace only", async () => {
    mocks.findTemplate.mockResolvedValue(undefined)

    await expect(
      find(
        "GET",
        "/v1/whatsapp/templates/{id}",
      )?.({
        context,
        input: { id: "9" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findTemplate).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
  })

  test("sync pulls from Meta for a number of this workspace, else 404", async () => {
    mocks.findIntegration.mockResolvedValueOnce({ id: "3" })
    await find(
      "POST",
      "/v1/whatsapp-channels/{id}/templates/sync",
    )?.({
      context,
      input: { id: "3" },
    })
    expect(mocks.sync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationWhatsapp: { id: "3" },
    })

    mocks.sync.mockClear()
    mocks.findIntegration.mockResolvedValueOnce(undefined)
    await expect(
      find(
        "POST",
        "/v1/whatsapp-channels/{id}/templates/sync",
      )?.({
        context,
        input: { id: "foreign" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  test("catalog search is scoped to the token's workspace", async () => {
    mocks.searchProducts.mockResolvedValue({ connected: true, items: [] })

    await find(
      "GET",
      "/v1/whatsapp/templates/catalog-products",
    )?.({
      context,
      input: { keyword: "shoe" },
    })

    expect(mocks.searchProducts).toHaveBeenCalledWith({
      keyword: "shoe",
      workspaceId: "ws-1",
    })
  })
})
