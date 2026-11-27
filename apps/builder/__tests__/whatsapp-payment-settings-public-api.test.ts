// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

type ProcedureHandler = (args: {
  context: { workspace: { id: string } }
  input: Record<string, unknown>
}) => Promise<unknown>

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: ProcedureHandler
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: ProcedureHandler) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    scopes,
    orpcMock: {
      workspaceTokenAuthAPIForScope: (scope: string) => {
        scopes.push(scope)
        return api
      },
    },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  findWorkspaceIntegration: vi.fn(),
  updatePixRedirectEnabled: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  integrationWhatsappService: {
    findWorkspaceIntegration: mocks.findWorkspaceIntegration,
    updatePixRedirectEnabled: mocks.updatePixRedirectEnabled,
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

await import("@/features/integration-whatsapp/payment/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }
const path = "/v1/whatsapp-channels/{id}/payment-settings"

describe("WhatsApp payment settings routes", () => {
  test("use the integrations scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["integrations"]))
  })

  test("get returns the policy and never the credentials", async () => {
    mocks.findWorkspaceIntegration.mockResolvedValue({
      id: "3",
      auth: { tokens: { accessToken: "secret" } },
      pixRedirectEnabled: true,
    })

    const result = await find("GET", path)?.({ context, input: { id: "3" } })

    expect(mocks.findWorkspaceIntegration).toHaveBeenCalledWith({
      id: "3",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ pixRedirectEnabled: true })
  })

  test("get on a channel outside the workspace is not found", async () => {
    mocks.findWorkspaceIntegration.mockResolvedValue(null)

    await expect(
      Promise.resolve(find("GET", path)?.({ context, input: { id: "9" } })),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("update saves the policy scoped to the caller's workspace", async () => {
    await find(
      "PUT",
      path,
    )?.({
      context,
      input: { id: "3", pixRedirectEnabled: false },
    })

    expect(mocks.updatePixRedirectEnabled).toHaveBeenCalledWith({
      id: "3",
      workspaceId: "ws-1",
      enabled: false,
    })
  })
})
