import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  successStatus?: number
  spec?: unknown
}
type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: never[]) => unknown
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
      handler: vi.fn((fn: CapturedProcedure["handler"]) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }
  const api = { route: vi.fn((config: RouteConfig) => makeProcedure(config)) }
  return {
    workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => api),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const inboundWebhookService = {
  list: vi.fn(),
  create: vi.fn(),
  findOrFail: vi.fn(),
  update: vi.fn(),
  updateSettings: vi.fn(),
  regenerateToken: vi.fn(),
  previewMapping: vi.fn(),
  listRequests: vi.fn(),
  findRequestOrFail: vi.fn(),
  deleteMany: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  inboundWebhookService,
  resolveTenantSettings: vi.fn(async () => ({
    appUrl: "https://chat.acme.test",
  })),
}))

await import("@/features/inbound-webhooks/api/public")

const scopeAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

const handlerOf = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found as Required<CapturedProcedure> & CapturedProcedure
}

const call = (method: string, path: string, input: object) =>
  (
    handlerOf(method, path).handler as unknown as (args: {
      context: { workspace: { id: string } }
      input: object
    }) => Promise<unknown>
  )({ context: { workspace: { id: "ws-1" } }, input })

const TOKEN = "iwh_secrettoken"
const webhook = {
  id: "w-1",
  workspaceId: "ws-1",
  name: "Orders",
  active: false,
  token: TOKEN,
  inboxResolution: null,
  identifiers: [],
  fieldMappings: [],
  actions: [],
  sampleJson: null,
  requestCount: 42,
  createdAt: new Date("2026-10-14T00:00:00Z"),
  updatedAt: new Date("2026-10-14T00:00:00Z"),
}
const ENDPOINT = `https://chat.acme.test/api/hooks/${TOKEN}`

beforeEach(() => {
  vi.clearAllMocks()
})

test("every procedure sits under the integrations scope", () => {
  expect(scopeAtImport).toBe("integrations")
})

describe("registered operations", () => {
  test.each([
    ["GET", "/v1/inbound-webhooks"],
    ["POST", "/v1/inbound-webhooks"],
    ["GET", "/v1/inbound-webhooks/{id}"],
    ["PUT", "/v1/inbound-webhooks/{id}"],
    ["PATCH", "/v1/inbound-webhooks/{id}/settings"],
    ["POST", "/v1/inbound-webhooks/{id}/regenerate-token"],
    ["POST", "/v1/inbound-webhooks/preview-mapping"],
    ["GET", "/v1/inbound-webhooks/{id}/requests"],
    ["GET", "/v1/inbound-webhooks/{id}/requests/{requestId}"],
    ["POST", "/v1/inbound-webhooks/bulk-delete"],
    ["DELETE", "/v1/inbound-webhooks/{id}"],
    ["GET", "/v1/inbound-webhook-channels"],
  ])("%s %s", (method, path) => {
    expect(handlerOf(method, path)).toBeDefined()
  })

  test("reads are marked read-only for MCP and deletes answer 204", () => {
    expect(handlerOf("GET", "/v1/inbound-webhooks").route.spec).toBeTypeOf(
      "function",
    )
    expect(
      handlerOf("POST", "/v1/inbound-webhooks/preview-mapping").route.spec,
    ).toBeTypeOf("function")
    expect(
      handlerOf("DELETE", "/v1/inbound-webhooks/{id}").route.successStatus,
    ).toBe(204)
    expect(handlerOf("POST", "/v1/inbound-webhooks").route.successStatus).toBe(
      201,
    )
  })
})

describe("the secret URL", () => {
  test("list never exposes the token or the URL", async () => {
    inboundWebhookService.list.mockResolvedValue({
      data: [webhook],
      pageCount: 1,
    })

    const result = await call("GET", "/v1/inbound-webhooks", {
      page: 1,
      perPage: 50,
    })

    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(result).toEqual({
      data: [
        {
          id: "w-1",
          name: "Orders",
          active: false,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
          requestCount: 42,
        },
      ],
      pageCount: 1,
    })
  })

  test.each([
    ["create", "POST", "/v1/inbound-webhooks", "create", { name: "Orders" }],
    ["get", "GET", "/v1/inbound-webhooks/{id}", "findOrFail", { id: "w-1" }],
  ] as const)("%s returns the endpoint on the tenant's app URL", async (_name, method, path, serviceMethod, input) => {
    inboundWebhookService[serviceMethod].mockResolvedValue(webhook)

    const result = (await call(method, path, input)) as { endpointUrl: string }

    expect(result.endpointUrl).toBe(ENDPOINT)
  })

  test("get never hands the endpoint URL (a write credential) to a read-only token", async () => {
    inboundWebhookService.findOrFail.mockResolvedValue(webhook)

    const result = await (
      handlerOf("GET", "/v1/inbound-webhooks/{id}")
        .handler as unknown as (args: {
        context: { workspace: { id: string }; apiToken: { permission: string } }
        input: object
      }) => Promise<Record<string, unknown>>
    )({
      context: {
        workspace: { id: "ws-1" },
        apiToken: { permission: "read_only" },
      },
      input: { id: "w-1" },
    })

    expect(result).not.toHaveProperty("endpointUrl")
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(result.name).toBe("Orders")
  })

  test("regenerateToken returns only the new endpoint", async () => {
    inboundWebhookService.regenerateToken.mockResolvedValue({
      ...webhook,
      token: "iwh_newtoken",
    })

    await expect(
      call("POST", "/v1/inbound-webhooks/{id}/regenerate-token", { id: "w-1" }),
    ).resolves.toEqual({
      endpointUrl: "https://chat.acme.test/api/hooks/iwh_newtoken",
    })
    expect(inboundWebhookService.regenerateToken).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "w-1",
    })
  })
})

describe("writes", () => {
  test("update passes the workspace from the token and clears an omitted sample", async () => {
    inboundWebhookService.update.mockResolvedValue(webhook)

    await call("PUT", "/v1/inbound-webhooks/{id}", {
      id: "w-1",
      inboxResolution: { mode: "inbox", inboxId: "5" },
      identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
      fieldMappings: [],
      actions: [],
    })

    expect(inboundWebhookService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "w-1",
      inboxResolution: { mode: "inbox", inboxId: "5" },
      identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
      fieldMappings: [],
      actions: [],
      sampleJson: null,
    })
  })

  test("updateSettings forwards only the settings", async () => {
    inboundWebhookService.updateSettings.mockResolvedValue(webhook)

    await call("PATCH", "/v1/inbound-webhooks/{id}/settings", {
      id: "w-1",
      active: true,
    })

    expect(inboundWebhookService.updateSettings).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "w-1",
      active: true,
    })
  })

  test("deletes are scoped to the token's workspace", async () => {
    await call("POST", "/v1/inbound-webhooks/bulk-delete", { ids: ["1", "2"] })
    await call("DELETE", "/v1/inbound-webhooks/{id}", { id: "3" })

    expect(inboundWebhookService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1", "2"],
    })
    expect(inboundWebhookService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "3",
    })
  })
})

describe("previewMapping", () => {
  test("runs the shared extraction in the token's workspace and returns its result untouched", async () => {
    const extracted = {
      inboxIdentifier: "page-1",
      identifiers: [],
      identities: {},
      fields: [],
    }
    inboundWebhookService.previewMapping.mockResolvedValue(extracted)
    const input = {
      payload: { a: 1 },
      inboxResolution: null,
      identifiers: [],
      fieldMappings: [],
    }

    await expect(
      call("POST", "/v1/inbound-webhooks/preview-mapping", input),
    ).resolves.toBe(extracted)
    expect(inboundWebhookService.previewMapping).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ...input,
    })
  })
})

describe("requests", () => {
  const request = {
    id: "r-1",
    status: "processed",
    skipReason: null,
    errorCode: null,
    errorMessage: null,
    inboxId: "5",
    contactId: "9",
    attempts: 1,
    createdAt: new Date("2026-10-14T01:00:00Z"),
    processedAt: new Date("2026-10-14T01:00:01Z"),
    fieldErrors: null,
    actionResults: [],
    payload: { secret: "personal data" },
    clientIp: "203.0.113.7",
    userAgent: "Shopify/1.0",
  }

  test("list checks the webhook belongs to the workspace and omits payloads", async () => {
    inboundWebhookService.findOrFail.mockResolvedValue(webhook)
    inboundWebhookService.listRequests.mockResolvedValue({
      data: [request],
      pageCount: 1,
    })

    const result = await call("GET", "/v1/inbound-webhooks/{id}/requests", {
      id: "w-1",
      page: 1,
      perPage: 50,
      status: "processed",
    })

    expect(inboundWebhookService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "w-1",
    })
    expect(inboundWebhookService.listRequests).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboundWebhookId: "w-1",
      status: "processed",
      page: 1,
      perPage: 50,
    })
    expect(JSON.stringify(result)).not.toContain("personal data")
  })

  test("a request's IP and user agent are never returned, payload or not", async () => {
    inboundWebhookService.findOrFail.mockResolvedValue(webhook)
    inboundWebhookService.findRequestOrFail.mockResolvedValue(request)
    inboundWebhookService.listRequests.mockResolvedValue({
      data: [request],
      pageCount: 1,
    })

    const detail = await call(
      "GET",
      "/v1/inbound-webhooks/{id}/requests/{requestId}",
      { id: "w-1", requestId: "r-1", includePayload: true },
    )
    const list = await call("GET", "/v1/inbound-webhooks/{id}/requests", {
      id: "w-1",
      page: 1,
      perPage: 50,
    })

    for (const result of [detail, list]) {
      expect(JSON.stringify(result)).not.toContain("203.0.113.7")
      expect(JSON.stringify(result)).not.toContain("Shopify")
    }
  })

  test("getRequest returns the payload only when asked", async () => {
    inboundWebhookService.findRequestOrFail.mockResolvedValue(request)
    const path = "/v1/inbound-webhooks/{id}/requests/{requestId}"

    const without = await call("GET", path, {
      id: "w-1",
      requestId: "r-1",
      includePayload: "false",
    })
    const withPayload = await call("GET", path, {
      id: "w-1",
      requestId: "r-1",
      includePayload: "true",
    })

    expect(without).not.toHaveProperty("payload")
    expect(withPayload).toHaveProperty("payload", { secret: "personal data" })
    expect(inboundWebhookService.findRequestOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboundWebhookId: "w-1",
      id: "r-1",
    })
  })
})

describe("inboundWebhookChannels.list", () => {
  test("publishes the registry with machine-usable fields only", async () => {
    const channels = (await call(
      "GET",
      "/v1/inbound-webhook-channels",
      {},
    )) as {
      channel: string
      payloadResolvable: boolean
      inboxIdentifiers: {
        kind: string
        description: string
        examplePath: string
      }[]
      channelUserId: {
        kind: string
        description: string
        examplePath: string
      } | null
      creationIdentities: string[]
    }[]
    const byChannel = new Map(channels.map((entry) => [entry.channel, entry]))

    expect(byChannel.get("messenger")).toMatchObject({
      payloadResolvable: true,
      inboxIdentifiers: [{ kind: "pageId", examplePath: "$.entry[0].id" }],
      channelUserId: { kind: "psid", examplePath: "$.sender.id" },
      creationIdentities: ["channelUserId"],
    })
    expect(
      byChannel.get("whatsapp")?.inboxIdentifiers.map(({ kind }) => kind),
    ).toEqual(["phoneNumberId", "displayPhoneNumber"])
    expect(byChannel.get("webchat")).toMatchObject({
      payloadResolvable: false,
      creationIdentities: ["phone", "email"],
    })
    expect(JSON.stringify(channels)).not.toContain("labelKey")
    // Every identifier says what value its path must yield.
    for (const entry of channels) {
      for (const identifier of entry.inboxIdentifiers) {
        expect(identifier.description.length).toBeGreaterThan(10)
      }
    }
    expect(byChannel.get("whatsapp")).toMatchObject({
      channelUserId: { kind: "whatsappId" },
      creationIdentities: ["phone"],
    })
    expect(JSON.stringify(channels)).not.toContain("acceptedIdentities")
    expect(byChannel.get("telegram")?.inboxIdentifiers[0]).toMatchObject({
      kind: "botId",
      description: expect.stringContaining("not the @username"),
    })
  })
})
