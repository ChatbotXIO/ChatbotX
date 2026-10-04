// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// The WhatsApp template list filter on `status` was dropped once before
// (#511). These pin that every caller still forwards it to the service.

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const makeProcedure = (route: { method: string; path: string }) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain: Record<string, unknown> = {}
    for (const name of ["input", "output", "errors", "use"]) {
      chain[name] = vi.fn(() => chain)
    }
    chain.handler = vi.fn((fn: (...args: any[]) => any) => {
      record.handler = fn
      return { handler: fn }
    })
    return chain
  }
  const api = { route: vi.fn((config: never) => makeProcedure(config)) }
  return {
    capturedProcedures,
    orpcMock: {
      workspaceTokenAuthAPIForScope: vi.fn(() => api),
      authorizedAPI: api,
    },
  }
})

vi.mock("@/orpc", () => orpcMock)
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware: {} }))

const { whatsappMessageTemplateService, noRows } = vi.hoisted(() => ({
  whatsappMessageTemplateService: { list: vi.fn(async () => []) },
  noRows: vi.fn(async () => []),
}))
// Resource schemas come from the real barrel (same approach as
// contacts-crud-public-api.test.ts); only the services are replaced.
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
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  whatsappMessageTemplateService,
  adsConversionService: { list: noRows },
  instagramIntegrationService: { findByWorkspaceId: noRows },
  integrationWhatsappService: { listByWorkspaceId: noRows },
  messengerIntegrationService: { findByWorkspaceId: noRows },
  messengerMessageTemplateService: { list: noRows },
}))
vi.mock("@/features/automated-response/queries", () => ({
  listAutomatedResponses: vi.fn(async () => ({ data: [] })),
}))
vi.mock("@/features/tags/queries", () => ({
  listTags: vi.fn(async () => ({ data: [] })),
}))

await import("@/features/integration-whatsapp/message-templates/api/public")
await import("@/features/integration-whatsapp/message-templates/api/private")
const { getConversionEventsData } = await import(
  "@/features/ads/queries/conversion-rules"
)

const findHandler = (path: string, method = "GET") =>
  capturedProcedures.find(
    (p) => p.route.path === path && p.route.method === method,
  )?.handler

beforeEach(() => {
  whatsappMessageTemplateService.list.mockClear()
})

describe.each([
  ["public list", "/v1/whatsapp/templates"],
  ["deprecated public list", "/v1/template-messages"],
])("%s", (_name, path) => {
  test("forwards the status filter", async () => {
    await findHandler(path)?.({
      context: { workspace: { id: "ws-1" } },
      input: { status: "APPROVED" },
    })

    expect(whatsappMessageTemplateService.list).toHaveBeenCalledWith({
      where: { status: "APPROVED", workspaceId: "ws-1" },
    })
  })
})

describe("private list", () => {
  test("forwards the status filter", async () => {
    await findHandler("/workspaces/{workspaceId}/whatsapp-message-templates")?.(
      { input: { workspaceId: "ws-1", status: "REJECTED" } },
    )

    expect(whatsappMessageTemplateService.list).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", status: "REJECTED" },
    })
  })
})

describe("conversion rules picker", () => {
  test("asks for APPROVED templates only", async () => {
    await getConversionEventsData("ws-1")

    expect(whatsappMessageTemplateService.list).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", status: "APPROVED" },
    })
  })
})
