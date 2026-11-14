// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string; tags: string[]; spec?: unknown }
  errors?: Record<string, unknown>
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const makeProcedure = (route: CapturedProcedure["route"]) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain: Record<string, unknown> = {}
    for (const name of ["input", "output"]) {
      chain[name] = vi.fn(() => chain)
    }
    chain.errors = vi.fn((errors: Record<string, unknown>) => {
      record.errors = errors
      return chain
    })
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

const connect = vi.hoisted(() => ({
  connectLine: vi.fn(),
  checkConnectedLineWebhook: vi.fn(),
}))
vi.mock("@/features/integration-line/lib/connect-line", () => connect)

const services = vi.hoisted(() => ({
  line: {
    findById: vi.fn(),
    listByWorkspace: vi.fn(),
    disconnect: vi.fn(async () => undefined),
  },
  workspace: { findById: vi.fn(async () => ({ ownerId: "owner1" })) },
  audit: { record: vi.fn(async () => undefined) },
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lineIntegrationService: services.line,
  workspaceService: services.workspace,
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: services.audit,
}))

const SECRET_PATTERN = /TOP-SECRET|TOKEN|auth/i

const row = {
  id: "10",
  inboxId: "20",
  workspaceId: "w1",
  channelId: "1234",
  name: "Shop",
  basicId: "@shop",
  pictureUrl: null,
  createdAt: new Date("2026-01-01"),
  auth: { clientSecret: "TOP-SECRET", tokens: { accessToken: "TOKEN" } },
  botUserId: "Ubot",
  tokenRefreshError: null,
}

const ctx = { context: { workspace: { id: "w1" } } }
const find = (method: string, path: string) => {
  const p = capturedProcedures.find(
    (c) => c.route.method === method && c.route.path === path,
  )
  if (!p?.handler) {
    throw new Error(`no ${method} ${path}`)
  }
  return p as Required<CapturedProcedure>
}

describe("line public api", () => {
  beforeAll(async () => {
    await import("@/features/integration-line/api/public")
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("uses the channels scope and declares errors on every route", () => {
    expect(scopes).toContain("channels")
    expect(capturedProcedures).toHaveLength(5)
    for (const p of capturedProcedures) {
      expect(p.errors).toBeDefined()
    }
  })

  test("connect returns no secret or auth fields", async () => {
    connect.connectLine.mockResolvedValue({
      workspaceId: "w1",
      integrationId: "10",
      inboxId: "20",
      name: "Shop",
      basicId: "@shop",
      webhook: {
        url: "https://x/hook",
        previousWebhookUrl: null,
        active: true,
        testOk: true,
      },
    })
    const out = await find("POST", "/v1/line-channels").handler({
      ...ctx,
      input: { channelId: "1234", channelSecret: "TOP-SECRET" },
    })
    expect(connect.connectLine).toHaveBeenCalledWith({
      workspaceId: "w1",
      user: null,
      channelId: "1234",
      channelSecret: "TOP-SECRET",
    })
    expect(out).toEqual({
      id: "10",
      inboxId: "20",
      name: "Shop",
      basicId: "@shop",
      webhook: expect.objectContaining({ active: true, testOk: true }),
    })
    expect(JSON.stringify(out)).not.toMatch(SECRET_PATTERN)
  })

  test("connect propagates the typed channelDuplicated error", async () => {
    const { channelDuplicatedException } = await import(
      "@chatbotx.io/business/errors"
    )
    connect.connectLine.mockRejectedValue(channelDuplicatedException())
    await expect(
      find("POST", "/v1/line-channels").handler({
        ...ctx,
        input: { channelId: "1234", channelSecret: "s" },
      }),
    ).rejects.toMatchObject({ code: "channelDuplicated" })
  })

  test("list and get never include auth", async () => {
    services.line.listByWorkspace.mockResolvedValue([row])
    services.line.findById.mockResolvedValue(row)
    const list = await find("GET", "/v1/line-channels").handler(ctx)
    const got = await find("GET", "/v1/line-channels/{id}").handler({
      ...ctx,
      input: { id: "10" },
    })
    expect(list.data).toHaveLength(1)
    expect(JSON.stringify([list, got])).not.toMatch(SECRET_PATTERN)
    expect(got.channelId).toBe("1234")
  })

  test("get with an id from another workspace is a 404", async () => {
    const { ModelNotfoundException } = await import(
      "@chatbotx.io/database/errors"
    )
    services.line.findById.mockRejectedValue(
      new ModelNotfoundException("Integration LINE not found"),
    )
    await expect(
      find("GET", "/v1/line-channels/{id}").handler({
        ...ctx,
        input: { id: "99" },
      }),
    ).rejects.toBeInstanceOf(ModelNotfoundException)
    expect(services.line.findById).toHaveBeenCalledWith({
      id: "99",
      workspaceId: "w1",
    })
  })

  test("delete disconnects within the token's workspace", async () => {
    services.line.findById.mockResolvedValue(row)
    await find("DELETE", "/v1/line-channels/{id}").handler({
      ...ctx,
      input: { id: "10" },
    })
    expect(services.line.disconnect).toHaveBeenCalledWith({
      workspaceId: "w1",
      id: "10",
      inboxId: "20",
      ownerId: "owner1",
    })
  })

  test("test-webhook returns the check result with active", async () => {
    services.line.findById.mockResolvedValue(row)
    connect.checkConnectedLineWebhook.mockResolvedValue({
      active: false,
      testOk: false,
      testReason: "Not reachable",
    })
    const out = await find(
      "POST",
      "/v1/line-channels/{id}/test-webhook",
    ).handler({ ...ctx, input: { id: "10" } })
    expect(connect.checkConnectedLineWebhook).toHaveBeenCalledWith(row)
    expect(out).toEqual({
      success: false,
      reason: "Not reachable",
      active: false,
    })
  })
})
