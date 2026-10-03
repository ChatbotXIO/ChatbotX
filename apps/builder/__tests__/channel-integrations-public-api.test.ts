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

const coexist = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  whatsapp: vi.fn(),
  findIntegration: vi.fn(),
  findLatestRun: vi.fn(),
}))
vi.mock("@/features/integration-whatsapp/lib/coexist-trigger-sync", () => ({
  triggerSync: vi.fn(),
}))

const capiOps = vi.hoisted(() => ({
  saveCapiDataset: vi.fn(async () => undefined),
  saveCapiTestEventCodeFor: vi.fn(async () => undefined),
  sendCapiTestEventFor: vi.fn(async () => undefined),
}))
vi.mock("@/features/meta-conversions/lib/capi-operations", () => capiOps)

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
  coexistService: {
    enable: coexist.enable,
    disable: coexist.disable,
    findIntegrationForCoexist: coexist.findIntegration,
    findLatestRun: coexist.findLatestRun,
  },
  integrationWhatsappService: {
    updateHandoverResumeFlow: handoverServices.whatsapp,
    setCoexist: coexist.whatsapp,
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
  createCoexistRoute,
  createCapiRoutes,
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

describe("GET /v1/<channel>-channels/{id}/coexist", () => {
  const getHandler = () => {
    createCoexistRoute("messenger")
    return capturedProcedures.find(
      (p) =>
        p.route.method === "GET" &&
        p.route.path === "/v1/messenger-channels/{id}/coexist",
    )?.handler
  }
  const runRow = {
    id: "r1",
    status: "running",
    startedAt: null,
    finishedAt: null,
    totalScan: 10,
    currentScan: 4,
    currentStep: "page 1/3",
    syncProgress: 0,
    importedContactCount: 1,
    importedMessageCount: 2,
    skippedCount: 0,
    failedCount: 0,
    currentError: "Graph API: token EAAB… rejected",
    workspaceId: "ws-1",
    integrationId: "7",
  }

  test("returns the newest run without internal columns, scoped to the workspace", async () => {
    coexist.findIntegration.mockResolvedValue({ id: "7" })
    coexist.findLatestRun.mockResolvedValue(runRow)

    const result = await getHandler()?.({ context: ctx, input: { id: "7" } })

    expect(coexist.findLatestRun).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "7",
      channel: "messenger",
    })
    expect(result.run).toMatchObject({ id: "r1", currentScan: 4 })
    expect(result.run).not.toHaveProperty("workspaceId")
    expect(result.run).not.toHaveProperty("currentError")
  })

  test("is run: null when it never synced", async () => {
    coexist.findIntegration.mockResolvedValue({ id: "7" })
    coexist.findLatestRun.mockResolvedValue(null)

    await expect(
      getHandler()?.({ context: ctx, input: { id: "7" } }),
    ).resolves.toEqual({ run: null })
  })

  test("a channel of another workspace is a 404 and reads no run", async () => {
    coexist.findIntegration.mockResolvedValue(null)
    coexist.findLatestRun.mockClear()

    await expect(
      getHandler()?.({ context: ctx, input: { id: "7" } }),
    ).rejects.toThrow("Channel not found")
    expect(coexist.findLatestRun).not.toHaveBeenCalled()
  })
})

describe("PUT /v1/<channel>-channels/{id}/coexist", () => {
  const handlerFor = (channel: "whatsapp" | "messenger" | "instagram") => {
    createCoexistRoute(channel)
    return capturedProcedures.find(
      (p) =>
        p.route.method === "PUT" &&
        p.route.path === `/v1/${channel}-channels/{id}/coexist`,
    )?.handler
  }

  test("messenger enable goes through coexistService and returns the run id", async () => {
    coexist.enable.mockResolvedValue({ success: true, runId: "r1" })

    const result = await handlerFor("messenger")?.({
      context: ctx,
      input: { id: "3", enabled: true, aiReadsSyncedHistory: true },
    })

    expect(coexist.enable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "3",
      channel: "messenger",
      aiReadsSyncedHistory: true,
    })
    expect(result).toEqual({ success: true, runId: "r1" })
  })

  test("instagram disable stops the sync", async () => {
    coexist.disable.mockResolvedValue({ success: true })

    await handlerFor("instagram")?.({
      context: ctx,
      input: { id: "3", enabled: false, aiReadsSyncedHistory: false },
    })

    expect(coexist.disable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "3",
      channel: "instagram",
    })
  })

  test("whatsapp uses its own service with the Graph trigger", async () => {
    coexist.whatsapp.mockResolvedValue({ success: true })

    await handlerFor("whatsapp")?.({
      context: ctx,
      input: { id: "3", enabled: true, aiReadsSyncedHistory: false },
    })

    expect(coexist.whatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationId: "3",
        enabled: true,
      }),
    )
  })

  test("a channel of another workspace is a 404", async () => {
    coexist.enable.mockResolvedValue({ success: false, reason: "not_found" })

    await expect(
      handlerFor("messenger")?.({
        context: ctx,
        input: { id: "9", enabled: true, aiReadsSyncedHistory: false },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test.each([
    ["invalidAuth", 409],
    ["triggerRejected", 502],
    ["triggerThrew", 502],
  ])("whatsapp %s is not reported as not-found", async (cause, status) => {
    createCoexistRoute("whatsapp")
    const handler = capturedProcedures.find(
      (p) =>
        p.route.method === "PUT" &&
        p.route.path === "/v1/whatsapp-channels/{id}/coexist",
    )?.handler
    coexist.whatsapp.mockResolvedValue({ success: false, cause, reason: "x" })

    await expect(
      handler?.({
        context: ctx,
        input: { id: "3", enabled: true, aiReadsSyncedHistory: false },
      }),
    ).rejects.toMatchObject({ httpStatusCode: status })
  })
})

describe("CAPI routes", () => {
  const handler = (path: string, method: string) => {
    createCapiRoutes("whatsapp")
    return capturedProcedures.find(
      (p) =>
        p.route.method === method &&
        p.route.path === `/v1/whatsapp-channels/{id}/capi${path}`,
    )?.handler
  }

  test("dataset selection delegates to the shared operation in the token's workspace", async () => {
    await handler(
      "/dataset",
      "PUT",
    )?.({
      context: ctx,
      input: { id: "3", datasetId: "ds-1" },
    })

    expect(capiOps.saveCapiDataset).toHaveBeenCalledWith({
      channel: "whatsapp",
      workspaceId: "ws-1",
      integrationId: "3",
      datasetId: "ds-1",
    })
  })

  test("an empty test event code clears it", async () => {
    await handler(
      "/test-event-code",
      "PUT",
    )?.({
      context: ctx,
      input: { id: "3", testEventCode: "" },
    })

    expect(capiOps.saveCapiTestEventCodeFor).toHaveBeenCalledWith(
      expect.objectContaining({ testEventCode: null }),
    )
  })

  test("a refused test event is a 422 with a readable reason", async () => {
    const { CapiTestEventError } = await import("@chatbotx.io/business")
    capiOps.sendCapiTestEventFor.mockRejectedValueOnce(
      new CapiTestEventError("testEventCodeRequired"),
    )

    await expect(
      handler(
        "/test-event",
        "POST",
      )?.({
        context: ctx,
        input: { id: "3", messagingId: "84900000000" },
      }),
    ).rejects.toMatchObject({ httpStatusCode: 422 })
  })

  test("a sent test event reports success", async () => {
    await expect(
      handler(
        "/test-event",
        "POST",
      )?.({
        context: ctx,
        input: { id: "3", messagingId: "84900000000" },
      }),
    ).resolves.toEqual({ success: true })
  })
})
