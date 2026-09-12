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

const fbCommentAutomationService = { list: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({ fbCommentAutomationService }))

const createFbComment = vi.fn()
vi.mock("@/features/fb-comments/actions/create-fb-comment.action", () => ({
  createFbComment,
}))

const updateFbComment = vi.fn()
vi.mock("@/features/fb-comments/actions/update-fb-comment.action", () => ({
  updateFbComment,
}))

const deleteFbComment = vi.fn()
vi.mock("@/features/fb-comments/actions/delete-fb-comment.action", () => ({
  deleteFbComment,
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

  test("lists workspace FB comment automations", async () => {
    const response = { data: [{ id: "fb-comment-1" }], pageCount: 1 }
    fbCommentAutomationService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 1, perPage: 50, name: "welcome", isActive: true },
      }),
    ).resolves.toEqual(response)

    expect(fbCommentAutomationService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      name: "welcome",
      isActive: true,
    })
  })
})

describe("POST /v1/fb-comments", () => {
  const procedure = findProcedure("POST", "/v1/fb-comments")

  test("creates an automation in the token workspace", async () => {
    const input = { name: "Welcome commenters" }
    const record = { id: "fb-comment-1", ...input }
    createFbComment.mockResolvedValueOnce(record)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      record,
    )

    expect(createFbComment).toHaveBeenCalledWith("workspace-1", input)
  })
})

describe("PUT /v1/fb-comments/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/fb-comments/{id}")

  test("updates an automation in the token workspace", async () => {
    const input = { id: "fb-comment-1", name: "Updated automation" }
    const record = { ...input }
    updateFbComment.mockResolvedValueOnce(record)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      record,
    )

    expect(updateFbComment).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "fb-comment-1" },
      { name: "Updated automation" },
    )
  })
})

describe("DELETE /v1/fb-comments/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/fb-comments/{id}")

  test("deletes an automation in the token workspace", async () => {
    deleteFbComment.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "fb-comment-1" } }),
    ).resolves.toBeUndefined()

    expect(deleteFbComment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "fb-comment-1",
    })
  })

  test("surfaces the declared not-found error from deletion", async () => {
    deleteFbComment.mockRejectedValueOnce(
      new Error("FB Comment Automation not found"),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("FB Comment Automation not found")

    expect(deleteFbComment).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "missing",
    })
  })
})
