import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
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
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const notFound = Object.assign(new Error("not found"), { code: "notFound" })

const commentAutomationService = {
  findThreadsOrFail: vi.fn(),
  createThreadsAutomation: vi.fn(),
  updateThreadsAutomation: vi.fn(),
  deleteThreadsAutomation: vi.fn(),
  findTiktokOrFail: vi.fn(),
  createTiktokAutomation: vi.fn(),
  updateTiktokAutomation: vi.fn(),
  deleteTiktokAutomation: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ commentAutomationService }))

const listThreadsPostsForWorkspace = vi.fn()
vi.mock("@/features/threads-comments/lib/threads-posts", () => ({
  listThreadsPostsForWorkspace,
}))

// The narrowing itself is pinned by threads-tiktok-comment-read-adapters.test.ts;
// here it only has to be the one the router routes every row through.
vi.mock("@/features/threads-comments/lib/resource", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/threads-comments/lib/resource")
    >()
  return {
    ...original,
    toThreadsResource: vi.fn((row: object) => ({ ...row, narrowed: true })),
    listThreadsCommentResources: vi.fn(),
  }
})
vi.mock("@/features/tiktok-comments/lib/resource", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/tiktok-comments/lib/resource")
    >()
  return {
    ...original,
    toTiktokResource: vi.fn((row: object) => ({ ...row, narrowed: true })),
    listTiktokCommentResources: vi.fn(),
  }
})

await import("@/features/threads-comments/api/public")
await import("@/features/tiktok-comments/api/public")
const { listThreadsCommentResources } = await import(
  "@/features/threads-comments/lib/resource"
)
const { listTiktokCommentResources } = await import(
  "@/features/tiktok-comments/lib/resource"
)

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopesAtImport = workspaceTokenAuthAPIForScope.mock.calls.map(
  ([scope]) => scope,
)
const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers both routers under the automation scope", () => {
  expect(scopesAtImport).toEqual(["automation", "automation"])
})

const channels = [
  {
    name: "threads",
    basePath: "/v1/threads-comments",
    list: vi.mocked(listThreadsCommentResources),
    find: commentAutomationService.findThreadsOrFail,
    create: commentAutomationService.createThreadsAutomation,
    update: commentAutomationService.updateThreadsAutomation,
    remove: commentAutomationService.deleteThreadsAutomation,
  },
  {
    name: "tiktok",
    basePath: "/v1/tiktok-comments",
    list: vi.mocked(listTiktokCommentResources),
    find: commentAutomationService.findTiktokOrFail,
    create: commentAutomationService.createTiktokAutomation,
    update: commentAutomationService.updateTiktokAutomation,
    remove: commentAutomationService.deleteTiktokAutomation,
  },
] as const

describe.each(channels)("$name comments public API", (channel) => {
  test("list reads through the shared adapter with the token workspace", async () => {
    channel.list.mockResolvedValueOnce({ data: [], pageCount: 0 })

    await findProcedure("GET", channel.basePath).handler?.({
      context,
      input: { page: 1, perPage: 50, workspaceId: "ws-attacker" },
    })

    expect(channel.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })

  test("get surfaces the service's not-found error", async () => {
    channel.find.mockRejectedValueOnce(notFound)

    await expect(
      findProcedure("GET", `${channel.basePath}/{id}`).handler?.({
        context,
        input: { id: "missing" },
      }),
    ).rejects.toBe(notFound)
    expect(channel.find).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "missing",
    })
  })

  test("create writes into the token workspace", async () => {
    channel.create.mockResolvedValueOnce({ id: "1" })

    await expect(
      findProcedure("POST", channel.basePath).handler?.({
        context,
        input: { name: "Welcome" },
      }),
    ).resolves.toEqual({ id: "1", narrowed: true })
    expect(channel.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "Welcome" },
    })
  })

  test("update 404s before writing when the automation is missing", async () => {
    channel.find.mockRejectedValueOnce(notFound)

    await expect(
      findProcedure("PATCH", `${channel.basePath}/{id}`).handler?.({
        context,
        input: { id: "missing", name: "Renamed" },
      }),
    ).rejects.toBe(notFound)
    expect(channel.update).not.toHaveBeenCalled()
  })

  test("update splits the id out of the body", async () => {
    channel.find.mockResolvedValueOnce({ id: "1" })
    channel.update.mockResolvedValueOnce({ id: "1", name: "Renamed" })

    await findProcedure("PATCH", `${channel.basePath}/{id}`).handler?.({
      context,
      input: { id: "1", name: "Renamed" },
    })

    expect(channel.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "1",
      data: { name: "Renamed" },
    })
  })

  test("delete 404s before deleting when the automation is missing", async () => {
    channel.find.mockRejectedValueOnce(notFound)

    await expect(
      findProcedure("DELETE", `${channel.basePath}/{id}`).handler?.({
        context,
        input: { id: "missing" },
      }),
    ).rejects.toBe(notFound)
    expect(channel.remove).not.toHaveBeenCalled()
  })
})

test("GET /v1/threads-comments/threads-posts lists posts of the token workspace", async () => {
  listThreadsPostsForWorkspace.mockResolvedValueOnce({
    posts: [],
    accounts: [],
  })

  await findProcedure("GET", "/v1/threads-comments/threads-posts").handler?.({
    context,
  })

  expect(listThreadsPostsForWorkspace).toHaveBeenCalledWith("workspace-1")
})
