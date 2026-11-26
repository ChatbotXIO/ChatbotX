// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>

const { captured, authorizedGate, operations, permissionGate } = vi.hoisted(
  () => {
    const captured: {
      handler?: Handler
      name: string
      path: string
      use: { middleware: unknown }[]
    }[] = []
    const authorizedGate = { kind: "authorized" }
    const permissionGate = (key: string) => ({ kind: "permission", key })
    const operations = {
      listComments: vi.fn(),
      mergeComments: vi.fn(),
      refreshMetrics: vi.fn(),
      refreshNow: vi.fn(),
    }
    return { authorizedGate, captured, operations, permissionGate }
  },
)

vi.mock("@chatbotx.io/business", () => ({
  MAX_BULK_UPDATE_POSTS: 100,
  MAX_EXPORT_POST_ROWS: 5000,
  MAX_EXPORT_ROWS: 20_000,
  MAX_MERGE_VIEW_POSTS: 20,
  MAX_TOPICS_PER_POST: 20,
  channelPostExportKinds: ["comments", "phones", "rows"],
}))
vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: (permissions: {
    emailAndPhone?: boolean
    superAdmin?: boolean
  }) => Boolean(permissions.emailAndPhone || permissions.superAdmin),
}))
vi.mock("@/features/channel-posts/lib/management-operations", () => ({
  channelPostManagementOperations: operations,
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: authorizedGate,
  workspacePermissionMiddleware: permissionGate,
}))
vi.mock("@/orpc", () => {
  const makeProcedure = (path: string) => {
    const uses: { middleware: unknown }[] = []
    const entry: (typeof captured)[number] = {
      name: String(captured.length),
      path,
      use: uses,
    }
    const chain = {
      handler: vi.fn((handler: Handler) => {
        entry.handler = handler
        return { uses }
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
  return {
    authorizedAPI: {
      route: (config: { path: string }) => makeProcedure(config.path),
    },
  }
})

const { channelPostManagementAPIs } = await import(
  "@/features/channel-posts/api/management-private"
)

describe("the Posts page's private procedures", () => {
  test("there are the 13 procedures the page and the comments window call", () => {
    expect(Object.keys(channelPostManagementAPIs)).toHaveLength(13)
  })

  test("every one is gated by the workspace check and then the broadcast permission", () => {
    const procedures = captured.filter((procedure) => procedure.use.length > 0)

    expect(procedures).toHaveLength(13)
    for (const procedure of procedures) {
      expect(procedure.use).toHaveLength(2)
      expect(procedure.use[0].middleware).toBe(authorizedGate)
      expect(procedure.use[1].middleware).toEqual({
        key: "broadcast",
        kind: "permission",
      })
    }
  })
})

describe("who may see phone numbers in the comment procedures", () => {
  const call = async (path: string, permissions: object) => {
    const procedure = captured.find((candidate) =>
      candidate.path.endsWith(path),
    )
    await procedure?.handler?.({
      context: { workspaceMember: { permissions } },
      input: { postIds: ["1"], workspaceId: "ws-1" },
    })
  }

  test.each([
    ["listing", "/{id}/comments", operations.listComments],
    ["merge view", "/merge-view", operations.mergeComments],
  ] as const)("%s reads the permission from the membership in the context", async (_label, path, operation) => {
    await call(path, { emailAndPhone: true })
    await call(path, { superAdmin: true })
    await call(path, { broadcast: true })

    expect(operation.mock.calls.map(([caller]) => caller)).toEqual([
      { canViewEmailAndPhone: true, workspaceId: "ws-1" },
      { canViewEmailAndPhone: true, workspaceId: "ws-1" },
      { canViewEmailAndPhone: false, workspaceId: "ws-1" },
    ])
  })
})

describe("the refresh procedures", () => {
  const find = (path: string) =>
    captured.find((candidate) => candidate.path.endsWith(path))

  test("the refresh button reads the post now through the shared operation", async () => {
    operations.refreshNow.mockResolvedValue({ outcome: "refreshed", post: {} })

    const result = await find("/management/{id}/refresh")?.handler?.({
      input: { id: "9", workspaceId: "ws-1" },
    })

    expect(operations.refreshNow).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ outcome: "refreshed", post: {} })
  })

  test("the list asks fresh counts for its ids in the caller's workspace", async () => {
    operations.refreshMetrics.mockResolvedValue({
      fresh: 1,
      queued: 2,
      skipped: 0,
    })

    const result = await find("/management/refresh-metrics")?.handler?.({
      input: { ids: ["1", "2", "3"], workspaceId: "ws-1" },
    })

    expect(operations.refreshMetrics).toHaveBeenCalledWith("ws-1", [
      "1",
      "2",
      "3",
    ])
    expect(result).toEqual({ fresh: 1, queued: 2, skipped: 0 })
  })
})
