// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string; tags: string[] }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const makeProcedure = (route: CapturedProcedure["route"]) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain: Record<string, unknown> = {}
    for (const name of ["input", "output", "errors"]) {
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
    scopes,
    orpcMock: {
      workspaceTokenAuthAPIForScope: vi.fn((scope: string) => {
        scopes.push(scope)
        return api
      }),
    },
  }
})
vi.mock("@/orpc", () => orpcMock)

const handoverServices = vi.hoisted(() => ({
  whatsapp: vi.fn(async () => undefined),
  messenger: vi.fn(async () => undefined),
}))

const service = vi.hoisted(() => ({
  list: vi.fn(async () => []),
  get: vi.fn(async () => ({ id: "1" })),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  channelIntegrationService: service,
  integrationWhatsappService: {
    updateHandoverResumeFlow: handoverServices.whatsapp,
  },
  messengerIntegrationService: {
    updateHandoverResumeFlow: handoverServices.messenger,
  },
}))
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

const {
  channelIntegrationsPublicRouter,
  createChannelReadRoutes,
  createHandoverResumeFlowRoute,
} = await import("@/features/channel-integrations/api/public")

const ctx = { workspace: { id: "ws-1" } }
const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )

beforeEach(() => {
  service.list.mockClear()
  service.get.mockClear()
})

describe("channel integration routes", () => {
  test("all routes use the channels scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["channels"]))
  })

  test("unified list forwards the optional channel filter", async () => {
    await find("GET", "/v1/channel-integrations")?.handler?.({
      context: ctx,
      input: { channel: "messenger" },
    })

    expect(service.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
    })
    expect(channelIntegrationsPublicRouter.list).toBeDefined()
  })

  test.each([
    "whatsapp",
    "messenger",
    "instagram",
    "zalo",
    "tiktok",
  ] as const)("%s read routes are pinned to their channel", async (channel) => {
    createChannelReadRoutes(channel)

    await find("GET", `/v1/${channel}-channels`)?.handler?.({ context: ctx })
    await find("GET", `/v1/${channel}-channels/{id}`)?.handler?.({
      context: ctx,
      input: { id: "7" },
    })

    expect(service.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel,
    })
    expect(service.get).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel,
      id: "7",
    })
  })
})

describe.each([
  "whatsapp",
  "messenger",
] as const)("PATCH /v1/%s-channels/{id}/handover-resume-flow", (channel) => {
  const path = `/v1/${channel}-channels/{id}/handover-resume-flow`

  test("sets or clears the flow in the token's workspace", async () => {
    createHandoverResumeFlowRoute(channel)
    const handler = capturedProcedures.find(
      (p) => p.route.method === "PATCH" && p.route.path === path,
    )?.handler

    await handler?.({
      context: ctx,
      input: { id: "3", handoverResumeFlowId: "9" },
    })
    await handler?.({
      context: ctx,
      input: { id: "3", handoverResumeFlowId: null },
    })

    expect(handoverServices[channel]).toHaveBeenNthCalledWith(1, {
      id: "3",
      workspaceId: "ws-1",
      handoverResumeFlowId: "9",
    })
    expect(handoverServices[channel]).toHaveBeenNthCalledWith(2, {
      id: "3",
      workspaceId: "ws-1",
      handoverResumeFlowId: null,
    })
  })
})
