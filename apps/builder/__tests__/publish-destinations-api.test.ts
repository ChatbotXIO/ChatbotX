// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>
type Captured = {
  handler?: Handler
  method: string
  path: string
  use: { middleware: unknown }[]
}

const { captured, operations, scopes, settings, schedule } = vi.hoisted(() => ({
  captured: [] as Captured[],
  operations: { get: vi.fn(), list: vi.fn() },
  schedule: { freeSlots: vi.fn(), get: vi.fn(), update: vi.fn() },
  scopes: [] as string[],
  settings: { publishingSettings: vi.fn() },
}))

vi.mock("@/features/publish-destinations/lib/operations", () => ({
  publishDestinationOperations: operations,
}))
vi.mock("@/features/social-posts/lib/posting-schedule-operations", () => ({
  postingScheduleOperations: schedule,
}))
vi.mock("@/features/social-accounts/lib/social-account-operations", () => ({
  socialAccountOperations: settings,
}))
vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnChangingSocialPost: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnReadingSocialAccount: {},
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: { kind: "authorized" },
  workspacePermissionMiddleware: (key: string) => ({ key, kind: "permission" }),
}))
vi.mock("@/orpc", () => {
  const makeProcedure = (config: { method: string; path: string }) => {
    const entry: Captured = { ...config, use: [] }
    const chain = {
      errors: vi.fn(() => chain),
      handler: vi.fn((handler: Handler) => {
        entry.handler = handler
        return entry
      }),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      use: vi.fn((middleware: unknown) => {
        entry.use.push({ middleware })
        return chain
      }),
    }
    captured.push(entry)
    return chain
  }
  const api = {
    route: (config: { method: string; path: string }) => makeProcedure(config),
  }
  return {
    authorizedAPI: api,
    workspaceTokenAuthAPIForScope: (scope: string) => {
      scopes.push(scope)
      return api
    },
  }
})

const { publishDestinationsPublicRouter } = await import(
  "@/features/publish-destinations/api/public"
)
const { publishDestinationsAPIs } = await import(
  "@/features/publish-destinations/api/private"
)

const publicProcedures = captured.slice(0, 6)
const privateProcedures = captured.slice(6)

describe("publishDestinations public router", () => {
  test("is a posts-scope router with the static list path before /{id}", () => {
    expect(scopes).toEqual(["posts"])
    expect(Object.keys(publishDestinationsPublicRouter)).toEqual([
      "list",
      "get",
      "getPostingSlots",
      "updatePostingSlots",
      "listFreeSlots",
      "getPublishingSettings",
    ])
    expect(
      publicProcedures.map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "GET /v1/posts/destinations",
      "GET /v1/posts/destinations/{id}",
      "GET /v1/posts/destinations/{id}/posting-schedule",
      "PUT /v1/posts/destinations/{id}/posting-schedule",
      "GET /v1/posts/destinations/{id}/free-slots",
      "GET /v1/posts/destinations/{id}/publishing-settings",
    ])
  })

  test("list reads the token's workspace", async () => {
    operations.list.mockResolvedValue({ items: [] })

    const result = await publicProcedures[0]?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { providers: ["facebook"] },
    })

    expect(operations.list).toHaveBeenCalledWith({
      providers: ["facebook"],
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ items: [] })
  })

  test("publishing settings are read for the destination id of the path", async () => {
    await publicProcedures[5]?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "7" },
    })

    expect(settings.publishingSettings).toHaveBeenCalledWith({
      destinationId: "7",
      workspaceId: "ws-1",
    })
  })
})

describe("publishDestinations private twins", () => {
  test("every procedure checks the workspace, then the broadcast permission", () => {
    expect(Object.keys(publishDestinationsAPIs)).toHaveLength(5)
    expect(privateProcedures).toHaveLength(5)
    for (const procedure of privateProcedures) {
      expect(procedure.use.map(({ middleware }) => middleware)).toEqual([
        { kind: "authorized" },
        { key: "broadcast", kind: "permission" },
      ])
    }
  })

  test("list passes the workspace and filters through", async () => {
    operations.list.mockResolvedValue({ items: [] })

    await privateProcedures[0]?.handler?.({
      input: { states: ["ready"], workspaceId: "ws-9" },
    })

    expect(operations.list).toHaveBeenCalledWith({
      states: ["ready"],
      workspaceId: "ws-9",
    })
  })

  test("the posting schedule reads and writes through the shared operations", async () => {
    expect(
      privateProcedures.slice(2).map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "GET /workspaces/{workspaceId}/post-destinations/{id}/posting-schedule",
      "PUT /workspaces/{workspaceId}/post-destinations/{id}/posting-schedule",
      "GET /workspaces/{workspaceId}/post-destinations/{id}/free-slots",
    ])
    const workspace = { id: "ws-9", ownerId: "u-1" }
    await privateProcedures[2]?.handler?.({
      input: { id: "7", workspaceId: "ws-9" },
    })
    expect(schedule.get).toHaveBeenCalledWith("ws-9", {
      id: "7",
      workspaceId: "ws-9",
    })
    await privateProcedures[3]?.handler?.({
      context: { workspace },
      input: { id: "7", slots: [], timezone: "UTC", workspaceId: "ws-9" },
    })
    expect(schedule.update).toHaveBeenCalledWith(workspace, {
      id: "7",
      slots: [],
      timezone: "UTC",
    })
    await privateProcedures[4]?.handler?.({
      input: { id: "7", limit: 5, workspaceId: "ws-9" },
    })
    expect(schedule.freeSlots).toHaveBeenCalledWith("ws-9", {
      id: "7",
      limit: 5,
      workspaceId: "ws-9",
    })
  })
})
