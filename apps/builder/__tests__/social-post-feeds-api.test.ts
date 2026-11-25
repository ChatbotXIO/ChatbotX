// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>
type Captured = {
  handler?: Handler
  method: string
  path: string
  use: { middleware: unknown }[]
}

const { assertNotBlocked, authorizedGate, captured, permissionGate, service } =
  vi.hoisted(() => ({
    assertNotBlocked: vi.fn(),
    authorizedGate: { kind: "authorized" },
    captured: [] as Captured[],
    permissionGate: (key: string) => ({ key, kind: "permission" }),
    service: {
      checkNow: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      listItems: vi.fn(),
      pause: vi.fn(),
      preview: vi.fn(),
      resume: vi.fn(),
      update: vi.fn(),
    },
  }))

vi.mock("@chatbotx.io/business", () => ({ socialPostFeedService: service }))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: assertNotBlocked,
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: authorizedGate,
  workspacePermissionMiddleware: permissionGate,
}))
vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnChangingPostFeed: {},
  possibleErrorsOnCreatingPostFeed: {},
  possibleErrorsOnDeletingResource: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnMutatingPostFeed: {},
  possibleErrorsOnPreviewingPostFeed: {},
  possibleErrorsOnReadingPostFeedItem: {},
  possibleErrorsOnTestingPostFeed: {},
}))
vi.mock("@/orpc", () => {
  const makeProcedure = (config: { method: string; path: string }) => {
    const uses: { middleware: unknown }[] = []
    const entry: Captured = {
      method: config.method,
      path: config.path,
      use: uses,
    }
    const chain = {
      errors: vi.fn(() => chain),
      handler: vi.fn((handler: Handler) => {
        entry.handler = handler
        return { handler }
      }),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      use: vi.fn((middleware: unknown) => {
        uses.push({ middleware })
        return chain
      }),
    }
    captured.push(entry)
    return chain
  }
  const route = (config: { method: string; path: string }) =>
    makeProcedure(config)
  return {
    authorizedAPI: { route },
    workspaceTokenAuthAPIForScope: (scope: string) => {
      scopes.push(scope)
      return { route }
    },
  }
})

const scopes: string[] = []

const { postFeedsAPIs } = await import(
  "@/features/social-post-feeds/api/private"
)
const { postFeedsPublicRouter } = await import(
  "@/features/social-post-feeds/api/public"
)
const {
  POST_FEED_BULK_DELETE_POST_PATH,
  POST_FEED_BULK_DELETE_TOKEN_PATH,
  POST_FEED_PAUSE_POST_PATH,
  POST_FEED_PAUSE_TOKEN_PATH,
} = await import("@/features/social-post-feeds/lib/api-paths")

const workspace = { id: "ws-1", ownerId: "owner-1" }
const privateProcedures = captured.slice(0, Object.keys(postFeedsAPIs).length)
const publicProcedures = captured.slice(privateProcedures.length)
const handlerOf = (
  procedures: Captured[],
  method: string,
  path: string,
): Handler => {
  const found = procedures.find(
    (entry) => entry.method === method && entry.path === path,
  )
  if (!found?.handler) {
    throw new Error(`no handler for ${method} ${path}`)
  }
  return found.handler
}

describe("the post feed procedures", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test("every session procedure checks the workspace, then the broadcast permission", () => {
    expect(privateProcedures).toHaveLength(12)
    for (const procedure of privateProcedures) {
      expect(procedure.use.map(({ middleware }) => middleware)).toEqual([
        authorizedGate,
        { key: "broadcast", kind: "permission" },
      ])
    }
  })

  test("the public router uses the posts scope and exposes the whole surface", () => {
    expect(new Set(scopes)).toEqual(new Set(["posts"]))
    expect(Object.keys(postFeedsPublicRouter).sort()).toEqual([
      "bulkDelete",
      "check",
      "create",
      "delete",
      "get",
      "itemDraftContent",
      "list",
      "listItems",
      "pause",
      "preview",
      "resume",
      "test",
      "update",
    ])
    expect(
      publicProcedures.map((entry) => `${entry.method} ${entry.path}`),
    ).toEqual(
      expect.arrayContaining([
        "GET /v1/post-feeds",
        "POST /v1/post-feeds",
        "POST /v1/post-feeds/preview",
        "POST /v1/post-feeds/bulk-delete",
        "GET /v1/post-feeds/{id}",
        "PATCH /v1/post-feeds/{id}",
        "DELETE /v1/post-feeds/{id}",
        "POST /v1/post-feeds/{id}/pause",
        "POST /v1/post-feeds/{id}/resume",
        "POST /v1/post-feeds/{id}/check",
        "GET /v1/post-feeds/{id}/items",
        "POST /v1/post-feeds/{id}/test",
        "GET /v1/post-feeds/{id}/items/{itemId}/draft-content",
      ]),
    )
  })

  test("the static preview path comes before the id routes", () => {
    const paths = publicProcedures.map(
      (entry) => `${entry.method} ${entry.path}`,
    )

    expect(paths.indexOf("POST /v1/post-feeds/preview")).toBeLessThan(
      paths.indexOf("GET /v1/post-feeds/{id}"),
    )
  })

  test("bulk delete is registered before the id routes, on the posts scope", () => {
    const paths = publicProcedures.map(
      (entry) => `${entry.method} ${entry.path}`,
    )

    expect(paths.indexOf("POST /v1/post-feeds/bulk-delete")).toBeLessThan(
      paths.indexOf("GET /v1/post-feeds/{id}"),
    )
    expect(new Set(scopes)).toEqual(new Set(["posts"]))
  })

  test("both bulk deletes call the one operation, scoped to the workspace", async () => {
    service.deleteMany.mockResolvedValue({ deletedIds: ["1"], notFoundIds: [] })

    const viaToken = await handlerOf(
      publicProcedures,
      "POST",
      POST_FEED_BULK_DELETE_TOKEN_PATH,
    )({ context: { workspace }, input: { ids: ["1"] } })
    const viaSession = await handlerOf(
      privateProcedures,
      "POST",
      POST_FEED_BULK_DELETE_POST_PATH,
    )({ input: { ids: ["1"], workspaceId: "ws-1" } })

    expect(service.deleteMany).toHaveBeenCalledTimes(2)
    expect(service.deleteMany).toHaveBeenCalledWith({
      ids: ["1"],
      workspaceId: "ws-1",
    })
    expect(viaToken).toEqual(viaSession)
    expect(assertNotBlocked).not.toHaveBeenCalled()
  })

  test("the session bulk delete sits behind the broadcast permission", () => {
    const entry = privateProcedures.find(
      (procedure) => procedure.path === POST_FEED_BULK_DELETE_POST_PATH,
    )

    expect(entry?.use.map((use) => use.middleware)).toEqual([
      authorizedGate,
      permissionGate("broadcast"),
    ])
  })

  test("pause uses the shared path constants the trial gate allow-lists", () => {
    expect(POST_FEED_PAUSE_TOKEN_PATH).toBe("/v1/post-feeds/{id}/pause")
    expect(
      privateProcedures.some(
        (entry) => entry.path === POST_FEED_PAUSE_POST_PATH,
      ),
    ).toBe(true)
  })

  test("the token create names no author; the session create names the member", async () => {
    service.create.mockResolvedValue({ id: "f1" })
    const input = {
      destinationIds: ["1"],
      feedUrl: "https://e.test/f",
      name: "B",
    }

    await handlerOf(
      publicProcedures,
      "POST",
      "/v1/post-feeds",
    )({
      context: { workspace },
      input,
    })
    await handlerOf(
      privateProcedures,
      "POST",
      "/workspaces/{workspaceId}/post-feeds",
    )({
      context: { user: { id: "u-1" }, workspace },
      input: { ...input, workspaceId: "ws-1" },
    })

    expect(service.create).toHaveBeenNthCalledWith(1, {
      ...input,
      createdById: null,
      workspaceId: "ws-1",
    })
    expect(service.create).toHaveBeenNthCalledWith(2, {
      ...input,
      createdById: "u-1",
      workspaceId: "ws-1",
    })
  })

  test.each([
    ["POST", "/v1/post-feeds"],
    ["PATCH", "/v1/post-feeds/{id}"],
    ["POST", "/v1/post-feeds/{id}/resume"],
    ["POST", "/v1/post-feeds/{id}/check"],
    ["POST", "/v1/post-feeds/preview"],
  ])("%s %s is refused in a trial-expired workspace, before the service runs", async (method, path) => {
    assertNotBlocked.mockRejectedValue(new Error("workspaceBlocked"))

    await expect(
      handlerOf(
        publicProcedures,
        method,
        path,
      )({
        context: { workspace },
        input: { feedUrl: "https://e.test/f", id: "1" },
      }),
    ).rejects.toThrow("workspaceBlocked")
    for (const fn of Object.values(service)) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  test.each([
    ["GET", "/v1/post-feeds", "list"],
    ["POST", "/v1/post-feeds/{id}/pause", "pause"],
    ["DELETE", "/v1/post-feeds/{id}", "delete"],
    ["GET", "/v1/post-feeds/{id}/items", "listItems"],
  ])("%s %s still works in a trial-expired workspace", async (method, path, called) => {
    assertNotBlocked.mockRejectedValue(new Error("workspaceBlocked"))

    await handlerOf(
      publicProcedures,
      method,
      path,
    )({
      context: { workspace },
      input: { id: "1" },
    })

    expect(assertNotBlocked).not.toHaveBeenCalled()
    expect(service[called as keyof typeof service]).toHaveBeenCalled()
  })

  test("run now and resume go through the same service as the page", async () => {
    await handlerOf(
      publicProcedures,
      "POST",
      "/v1/post-feeds/{id}/check",
    )({
      context: { workspace },
      input: { id: "9" },
    })
    await handlerOf(
      privateProcedures,
      "POST",
      "/workspaces/{workspaceId}/post-feeds/{id}/check",
    )({ context: { workspace }, input: { id: "9", workspaceId: "ws-1" } })

    expect(service.checkNow).toHaveBeenCalledTimes(2)
    expect(service.checkNow).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
  })
})
