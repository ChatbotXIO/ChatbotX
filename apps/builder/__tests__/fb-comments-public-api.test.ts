import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

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

const commentAutomationService = {
  list: vi.fn(),
  findMessengerOrFail: vi.fn(),
  createMessenger: vi.fn(),
  updateMessenger: vi.fn(),
  deleteMessenger: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ commentAutomationService }))

const listFacebookPostsForAutomation = vi.fn()
vi.mock("@/features/fb-comments/lib/facebook-posts", () => ({
  listFacebookPostsForAutomation,
}))

await import("@/features/fb-comments/api/public")

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

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the FB comments public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/fb-comments", () => {
  const procedure = findProcedure("GET", "/v1/fb-comments")

  test("lists workspace FB comment automations across every folder", async () => {
    const response = { data: [{ id: "fb-comment-1" }], pageCount: 1 }
    commentAutomationService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 1, perPage: 50, name: "welcome", isActive: true },
      }),
    ).resolves.toEqual(response)

    expect(commentAutomationService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      name: "welcome",
      isActive: true,
      includeAllFolders: true,
    })
  })
})

describe("GET /v1/fb-comments/{id}", () => {
  const procedure = findProcedure("GET", "/v1/fb-comments/{id}")

  test("gets a single FB comment automation in the token workspace", async () => {
    const record = { id: "fb-comment-1", name: "Welcome" }
    commentAutomationService.findMessengerOrFail.mockResolvedValueOnce(record)

    await expect(
      procedure.handler?.({ context, input: { id: "fb-comment-1" } }),
    ).resolves.toEqual(record)

    expect(commentAutomationService.findMessengerOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "fb-comment-1",
    })
  })
})

describe("POST /v1/fb-comments", () => {
  const procedure = findProcedure("POST", "/v1/fb-comments")

  test("creates an automation in the token workspace", async () => {
    const input = { name: "Welcome commenters" }
    const record = { id: "fb-comment-1", ...input }
    commentAutomationService.createMessenger.mockResolvedValueOnce(record)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      record,
    )

    expect(commentAutomationService.createMessenger).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: input,
    })
  })
})

describe("PUT /v1/fb-comments/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/fb-comments/{id}")

  test("updates an automation in the token workspace", async () => {
    const input = { id: "fb-comment-1", name: "Updated automation" }
    const record = { ...input }
    commentAutomationService.updateMessenger.mockResolvedValueOnce(record)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      record,
    )

    expect(commentAutomationService.updateMessenger).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "fb-comment-1" },
      { name: "Updated automation" },
    )
  })
})

describe("DELETE /v1/fb-comments/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/fb-comments/{id}")

  test("deletes an automation in the token workspace", async () => {
    commentAutomationService.deleteMessenger.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "fb-comment-1" } }),
    ).resolves.toBeUndefined()

    expect(commentAutomationService.deleteMessenger).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "fb-comment-1",
    })
  })

  test("surfaces the declared not-found error from deletion", async () => {
    commentAutomationService.deleteMessenger.mockRejectedValueOnce(
      new Error("FB Comment Automation not found"),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("FB Comment Automation not found")

    expect(commentAutomationService.deleteMessenger).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "missing",
    })
  })
})

describe("GET /v1/fb-comments/facebook-posts", () => {
  const procedure = findProcedure("GET", "/v1/fb-comments/facebook-posts")

  test("lists Facebook posts eligible for FB comment automation", async () => {
    const response = {
      published: [],
      ads: [],
      reels: [],
      pages: [{ id: "page-1", name: "Page One" }],
    }
    listFacebookPostsForAutomation.mockResolvedValueOnce(response)

    await expect(procedure.handler?.({ context })).resolves.toEqual(response)

    expect(listFacebookPostsForAutomation).toHaveBeenCalledWith("workspace-1")
  })
})
