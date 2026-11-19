// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }
type Handler = (args: { input: Record<string, unknown> }) => Promise<unknown>
type Captured = {
  route: RouteConfig
  errors?: Record<string, { status: number }>
  handler?: Handler
}

const { captured, service, requireAdmin, makeProcedure } = vi.hoisted(() => {
  const captured: Captured[] = []
  const makeProcedure = (config: RouteConfig) => {
    const record: Captured = { route: config }
    captured.push(record)
    const chain: Record<string, unknown> = {}
    chain.input = () => chain
    chain.output = () => chain
    chain.use = () => chain
    chain.errors = (errors: Captured["errors"]) => {
      record.errors = errors
      return chain
    }
    chain.handler = (fn: Handler) => {
      record.handler = fn
      return fn
    }
    return chain
  }
  return {
    captured,
    makeProcedure,
    service: {
      listSources: vi.fn(),
      getSchema: vi.fn(),
      getAvailability: vi.fn(),
      get: vi.fn(),
      scheduleConnectImport: vi.fn(),
      retryHistory: vi.fn(),
    },
    requireAdmin: vi.fn(),
  }
})

vi.mock("@/orpc", () => ({
  authorizedAPI: {
    route: (config: RouteConfig) => makeProcedure(config),
  },
}))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware: {} }))
vi.mock("@chatbotx.io/business", () => ({ contactSyncService: service }))
vi.mock("@/features/contact-sync/lib/access", () => ({
  requireContactSyncAdmin: requireAdmin,
}))

await import("@/features/contact-sync/api/private")

const find = (method: string, path: string) => {
  const found = captured.find(
    (entry) => entry.route.method === method && entry.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure for ${method} ${path}`)
  }
  return found
}

const ACTOR = { type: "user", id: "user-1" }

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockResolvedValue({ userId: "user-1" })
})

describe("the session procedures", () => {
  const procedures: [string, string][] = [
    ["GET", "/workspaces/{workspaceId}/contact-syncs/sources"],
    ["GET", "/workspaces/{workspaceId}/contact-syncs/sources/{inboxId}/schema"],
    ["GET", "/workspaces/{workspaceId}/contact-syncs/availability"],
    ["GET", "/workspaces/{workspaceId}/contact-syncs/{runId}"],
    ["POST", "/workspaces/{workspaceId}/contact-syncs/connect-import"],
    [
      "POST",
      "/workspaces/{workspaceId}/contact-syncs/sources/{inboxId}/retry-history",
    ],
  ]

  test.each(
    procedures,
  )("%s %s declares the 403 contactSyncNotAdmin", (method, path) => {
    expect(find(method, path).errors?.contactSyncNotAdmin?.status).toBe(403)
  })

  test.each(
    procedures,
  )("%s %s refuses a non-admin before touching the service", async (method, path) => {
    requireAdmin.mockRejectedValue(
      Object.assign(new Error("no"), { code: "contactSyncNotAdmin" }),
    )

    await expect(
      find(method, path).handler?.({
        input: { workspaceId: "ws-1", inboxId: "i1", runId: "r1", pages: [] },
      }),
    ).rejects.toMatchObject({ code: "contactSyncNotAdmin" })
    for (const fn of Object.values(service)) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  test("listSources names the signed-in user as the actor", async () => {
    service.listSources.mockResolvedValue([])

    await find(
      "GET",
      "/workspaces/{workspaceId}/contact-syncs/sources",
    ).handler?.({
      input: { workspaceId: "ws-1" },
    })

    expect(service.listSources).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actor: ACTOR,
    })
  })

  test("getSchema names the signed-in user and the page", async () => {
    service.getSchema.mockResolvedValue({ tags: [], fields: [] })

    await find(
      "GET",
      "/workspaces/{workspaceId}/contact-syncs/sources/{inboxId}/schema",
    ).handler?.({ input: { workspaceId: "ws-1", inboxId: "i1" } })

    expect(service.getSchema).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actor: ACTOR,
      inboxId: "i1",
    })
  })

  test("the picker's connect import runs as the app, for the signed-in user", async () => {
    service.scheduleConnectImport.mockResolvedValue({ runId: null, pages: [] })
    const pages = [{ inboxId: "i1", aiReadsSyncedHistory: true }]

    await find(
      "POST",
      "/workspaces/{workspaceId}/contact-syncs/connect-import",
    ).handler?.({ input: { workspaceId: "ws-1", pages } })

    expect(service.scheduleConnectImport).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actor: ACTOR,
      triggerSource: "app",
      pages,
    })
  })

  test("retry-history re-opens the page's owed history sync", async () => {
    service.retryHistory.mockResolvedValue({ reopened: true })

    await expect(
      find(
        "POST",
        "/workspaces/{workspaceId}/contact-syncs/sources/{inboxId}/retry-history",
      ).handler?.({ input: { workspaceId: "ws-1", inboxId: "i1" } }),
    ).resolves.toEqual({ reopened: true })
    expect(service.retryHistory).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "i1",
    })
  })
})
