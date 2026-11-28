// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>

const {
  anyPermissionGate,
  captured,
  authorizedGate,
  operations,
  permissionGate,
} = vi.hoisted(() => {
  const captured: {
    handler?: Handler
    name: string
    path: string
    use: { middleware: unknown }[]
  }[] = []
  const authorizedGate = { kind: "authorized" }
  const permissionGate = (key: string) => ({ kind: "permission", key })
  const anyPermissionGate = (keys: readonly string[]) => ({
    kind: "anyPermission",
    keys,
  })
  const operations = {
    get: vi.fn(),
    listForPicker: vi.fn(),
    getCommentExport: vi.fn(),
    listComments: vi.fn(),
    mergeComments: vi.fn(),
    refreshMetrics: vi.fn(),
    refreshNow: vi.fn(),
    startCommentExport: vi.fn(),
  }
  return {
    anyPermissionGate,
    authorizedGate,
    captured,
    operations,
    permissionGate,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  MAX_BULK_UPDATE_POSTS: 100,
  MAX_EXPORT_POST_ROWS: 5000,
  MAX_EXPORT_ROWS: 20_000,
  MAX_MERGE_VIEW_POSTS: 20,
  MAX_TOPICS_PER_POST: 20,
  POST_COMMENT_SENDERS: ["contact", "page"],
  channelPostCommentExportKinds: ["comments", "phones", "emails"],
  channelPostExportKinds: ["comments", "phones", "emails", "rows"],
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
  workspaceAnyPermissionMiddleware: anyPermissionGate,
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

const isPickerPath = (path: string) => path.includes("/channel-posts/picker")

describe("the Posts page's private procedures", () => {
  test("there are the 15 procedures the page and the comments window call, plus the 2 of the post picker", () => {
    expect(Object.keys(channelPostManagementAPIs)).toHaveLength(17)
  })

  test("every page procedure is gated by the workspace check and then the broadcast permission", () => {
    const procedures = captured.filter(
      (procedure) => procedure.use.length > 0 && !isPickerPath(procedure.path),
    )

    expect(procedures).toHaveLength(15)
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

describe("the post picker's private procedures", () => {
  const pickerProcedures = () =>
    captured.filter((procedure) => isPickerPath(procedure.path))

  test("serve the inbox composer and the flow editor, not only the Posts page", () => {
    const procedures = pickerProcedures()

    expect(procedures.map((procedure) => procedure.path).sort()).toEqual([
      "/workspaces/{workspaceId}/channel-posts/picker",
      "/workspaces/{workspaceId}/channel-posts/picker/{id}",
    ])
    for (const procedure of procedures) {
      expect(procedure.use).toHaveLength(2)
      expect(procedure.use[0].middleware).toBe(authorizedGate)
      expect(procedure.use[1].middleware).toEqual({
        kind: "anyPermission",
        keys: ["contacts", "onlyAssignedContacts", "flows", "broadcast"],
      })
    }
  })

  test("list one inbox's posts and read one post through the shared operations", async () => {
    operations.listForPicker.mockResolvedValue({ items: [] })
    operations.get.mockResolvedValue({ id: "9" })
    const list = captured.find(
      (candidate) =>
        candidate.path === "/workspaces/{workspaceId}/channel-posts/picker",
    )
    const get = captured.find((candidate) =>
      candidate.path.endsWith("/picker/{id}"),
    )

    await list?.handler?.({ input: { inboxId: "4", workspaceId: "ws-1" } })
    await get?.handler?.({ input: { id: "9", workspaceId: "ws-1" } })

    expect(operations.listForPicker).toHaveBeenCalledWith("ws-1", {
      inboxId: "4",
      workspaceId: "ws-1",
    })
    expect(operations.get).toHaveBeenCalledWith("ws-1", {
      id: "9",
      workspaceId: "ws-1",
    })
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

describe("the comment export procedures", () => {
  const find = (suffix: string) =>
    captured.find((candidate) => candidate.path.endsWith(suffix))

  const context = (permissions: object) => ({
    user: { id: "user-1" },
    workspace: { ownerId: "owner-1" },
    workspaceMember: { permissions },
  })

  test.each([
    [
      "a member with the email-and-phone permission",
      { emailAndPhone: true },
      true,
    ],
    ["a super admin", { superAdmin: true }, true],
    ["a member without it", { broadcast: true }, false],
  ] as const)("starting for %s passes the permission, the owner and the member", async (_label, permissions, canViewEmailAndPhone) => {
    operations.startCommentExport.mockResolvedValue({
      fileId: "9",
      status: "pending",
    })
    const input = { kind: "emails", postIds: ["1"], workspaceId: "ws-1" }

    const result = await find("/management/exports")?.handler?.({
      context: context(permissions),
      input,
    })

    expect(operations.startCommentExport).toHaveBeenLastCalledWith(
      {
        canViewEmailAndPhone,
        ownerId: "owner-1",
        userId: "user-1",
        workspaceId: "ws-1",
      },
      input,
    )
    expect(result).toEqual({ fileId: "9", status: "pending" })
  })

  test("the status is read in the member's workspace with the member's permission", async () => {
    operations.getCommentExport.mockResolvedValue({ status: "pending" })

    await find("/management/exports/{fileId}")?.handler?.({
      context: context({ broadcast: true }),
      input: { fileId: "9", workspaceId: "ws-1" },
    })

    expect(operations.getCommentExport).toHaveBeenCalledWith(
      { canViewEmailAndPhone: false, workspaceId: "ws-1" },
      "9",
    )
  })
})
