// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
  schema?: { safeParse: (v: unknown) => { success: boolean } }
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      chain.input = (schema: CapturedProcedure["schema"]) => {
        record.schema = schema
        return chain
      }
      for (const name of ["output", "errors"]) {
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

const tenant = vi.hoisted(() => ({
  resolveTenantSettings: vi.fn(async () => ({
    storageUrl: "https://cdn.example.com",
  })),
}))

const service = vi.hoisted(() => ({
  findById: vi.fn(),
  updateSettings: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  workspaceService: service,
  resolveTenantSettings: tenant.resolveTenantSettings,
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

await import("@/features/workspaces/api/public")

const find = (method: string) =>
  capturedProcedures.find(
    (p) =>
      p.route.method === method && p.route.path === "/v1/workspace/settings",
  )
const context = { workspace: { id: "ws-1" } }
const row = {
  id: "ws-1",
  name: "Secret name",
  ownerId: "owner",
  defaultReply: null,
  defaultReplyFrequency: "allTime",
  smartResponseDelaySeconds: 10,
  capiLimitedDataUse: false,
  logo: null,
  targetCountry: "VN",
  language: "vi",
  timezone: "Asia/Ho_Chi_Minh",
  brandColor: "#016DFF",
  developmentMode: false,
}

describe("/v1/workspace/settings", () => {
  test("uses the dedicated settings scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["settings"]))
  })

  test("get returns only the settings fields of the token's workspace", async () => {
    service.findById.mockResolvedValue(row)

    const result = await find("GET")?.handler?.({ context })

    expect(service.findById).toHaveBeenCalledWith({ id: "ws-1" })
    expect(result).toEqual({
      defaultReply: null,
      defaultReplyFrequency: "allTime",
      smartResponseDelaySeconds: 10,
      capiLimitedDataUse: false,
      logo: null,
      targetCountry: "VN",
      language: "vi",
      timezone: "Asia/Ho_Chi_Minh",
      brandColor: "#016DFF",
      developmentMode: false,
    })
  })

  test("get resolves a stored logo path to a usable URL", async () => {
    service.findById.mockResolvedValue({
      ...row,
      logo: "public/space/ws-1/logos/a.jpg",
    })

    const result = await find("GET")?.handler?.({ context })

    expect(result.logo).toBe(
      "https://cdn.example.com/public/space/ws-1/logos/a.jpg",
    )
  })

  test("update passes the input to updateSettings for the token's workspace", async () => {
    service.updateSettings.mockResolvedValue({
      ...row,
      capiLimitedDataUse: true,
    })

    const result = await find("PATCH")?.handler?.({
      context,
      input: { capiLimitedDataUse: true },
    })

    expect(service.updateSettings).toHaveBeenCalledWith({
      id: "ws-1",
      data: { capiLimitedDataUse: true },
    })
    expect(result).toMatchObject({ capiLimitedDataUse: true })
    expect(result).not.toHaveProperty("name")
  })

  test("the request accepts only valid delays, frequencies and logo URLs", () => {
    const schema = find("PATCH")?.schema
    expect(schema?.safeParse({ smartResponseDelaySeconds: 30 }).success).toBe(
      true,
    )
    expect(schema?.safeParse({ smartResponseDelaySeconds: null }).success).toBe(
      true,
    )
    expect(schema?.safeParse({ smartResponseDelaySeconds: 7 }).success).toBe(
      false,
    )
    expect(
      schema?.safeParse({ defaultReplyFrequency: "sometimes" }).success,
    ).toBe(false)
    expect(schema?.safeParse({ logo: "javascript:alert(1)" }).success).toBe(
      false,
    )
    expect(
      schema?.safeParse({ logo: "https://cdn.example.com/l.png" }).success,
    ).toBe(true)
  })

  test("the request accepts only the builder's country, language and timezone values", () => {
    const schema = find("PATCH")?.schema
    expect(
      schema?.safeParse({
        targetCountry: "VN",
        language: "vi",
        timezone: "Asia/Ho_Chi_Minh",
        brandColor: "#112233",
        developmentMode: true,
      }).success,
    ).toBe(true)
    expect(schema?.safeParse({ targetCountry: "unknown" }).success).toBe(true)
    expect(schema?.safeParse({ targetCountry: "XX" }).success).toBe(false)
    expect(schema?.safeParse({ timezone: "Mars/Base" }).success).toBe(false)
    expect(schema?.safeParse({ language: "xx" }).success).toBe(false)
    expect(schema?.safeParse({ brandColor: "red" }).success).toBe(false)
  })
})
