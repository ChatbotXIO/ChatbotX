// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
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
    orpcMock: { workspaceTokenAuthAPIForScope: vi.fn(() => api) },
  }
})
vi.mock("@/orpc", () => orpcMock)
vi.mock("@/features/inboxes/queries", () => ({ listInboxes: vi.fn() }))

const inboxService = vi.hoisted(() => ({
  updateMarkReadOnOutbound: vi.fn(),
  findByIdOrFail: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  inboxService,
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

await import("@/features/inboxes/api/public")
const { publicInboxResource } = await import("@/features/inboxes/schema/action")

describe("PATCH /v1/inboxes/{id}", () => {
  const procedure = capturedProcedures.find(
    (p) => p.route.method === "PATCH" && p.route.path === "/v1/inboxes/{id}",
  )

  test("updates markReadOnOutbound in the token's workspace", async () => {
    inboxService.updateMarkReadOnOutbound.mockResolvedValueOnce({
      id: "5",
      workspaceId: "ws-1",
      name: "Shop",
      channel: "messenger",
      status: "connected",
      sourceId: "page-1",
      markReadOnOutbound: true,
    })

    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "5", markReadOnOutbound: true },
    })

    expect(inboxService.updateMarkReadOnOutbound).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "5",
      enabled: true,
    })
    expect(result).toEqual(
      expect.objectContaining({ id: "5", markReadOnOutbound: true }),
    )
  })

  test("with no field it returns the inbox unchanged and writes nothing", async () => {
    inboxService.updateMarkReadOnOutbound.mockClear()
    inboxService.findByIdOrFail.mockResolvedValueOnce({
      id: "5",
      workspaceId: "ws-1",
      name: "Shop",
      channel: "messenger",
      status: "connected",
      sourceId: "page-1",
      markReadOnOutbound: false,
    })

    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "5" },
    })

    expect(inboxService.updateMarkReadOnOutbound).not.toHaveBeenCalled()
    expect(inboxService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "5",
    })
    expect(result).toEqual(
      expect.objectContaining({ markReadOnOutbound: false }),
    )
  })

  test("a missing inbox is a 404", async () => {
    inboxService.findByIdOrFail.mockRejectedValueOnce(
      new Error("Inbox not found"),
    )

    await expect(
      procedure?.handler?.({
        context: { workspace: { id: "ws-1" } },
        input: { id: "404" },
      }),
    ).rejects.toThrow("Inbox not found")
  })

  test("the public inbox resource exposes the setting", () => {
    expect(publicInboxResource.shape.markReadOnOutbound).toBeDefined()
  })
})
