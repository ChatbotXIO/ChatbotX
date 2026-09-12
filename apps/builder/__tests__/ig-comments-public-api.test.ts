import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
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
      handler: vi.fn((fn: ProcedureHandler) => {
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

const fbCommentAutomationService = {
  listIgComments: vi.fn(),
  findInstagramOrFail: vi.fn(),
  createInstagram: vi.fn(),
  updateInstagram: vi.fn(),
  deleteInstagram: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ fbCommentAutomationService }))

const listInstagramLoginMedia = vi.fn()
const listInstagramFacebookMedia = vi.fn()
vi.mock("@/features/ig-comments/lib/instagram-media", () => ({
  listInstagramLoginMedia,
  listInstagramFacebookMedia,
}))

// The router must load after the mocks so its module-scope scope registration is captured.
await import("@/features/ig-comments/api/public")

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

test("registers the IG comments public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")

  expect(findProcedure("GET", "/v1/ig-comments")).toBeDefined()
  expect(findProcedure("GET", "/v1/ig-comments/{id}")).toBeDefined()
  expect(findProcedure("POST", "/v1/ig-comments")).toBeDefined()
  expect(findProcedure("PUT", "/v1/ig-comments/{id}")).toBeDefined()
  expect(findProcedure("DELETE", "/v1/ig-comments/{id}")).toBeDefined()
  expect(findProcedure("GET", "/v1/ig-comments/instagram-media")).toBeDefined()
})

describe("GET /v1/ig-comments", () => {
  const procedure = findProcedure("GET", "/v1/ig-comments")

  test("lists workspace-scoped IG comment automations across every folder", async () => {
    const response = { data: [{ id: "ig-comment-1" }], pageCount: 1 }
    fbCommentAutomationService.listIgComments.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: {
          page: 2,
          perPage: 20,
          sort: [{ id: "name", desc: false }],
          name: "Welcome",
          folderId: "folder-1",
          isActive: true,
        },
      }),
    ).resolves.toEqual(response)

    expect(fbCommentAutomationService.listIgComments).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 20,
      sort: [{ id: "name", desc: false }],
      name: "Welcome",
      folderId: "folder-1",
      isActive: true,
      includeAllFolders: true,
    })
  })
})

describe("GET /v1/ig-comments/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ig-comments/{id}")

  test("gets a single IG comment automation in the token workspace", async () => {
    const record = { id: "ig-comment-1", name: "Welcome" }
    fbCommentAutomationService.findInstagramOrFail.mockResolvedValueOnce(record)

    await expect(
      procedure.handler?.({ context, input: { id: "ig-comment-1" } }),
    ).resolves.toEqual(record)

    expect(fbCommentAutomationService.findInstagramOrFail).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        id: "ig-comment-1",
      },
    )
  })
})

describe("POST /v1/ig-comments", () => {
  const procedure = findProcedure("POST", "/v1/ig-comments")

  test("creates an IG comment automation in the token workspace", async () => {
    const input = { name: "Welcome", type: "instagram" }
    const created = { id: "ig-comment-1", ...input }
    fbCommentAutomationService.createInstagram.mockResolvedValueOnce(created)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      created,
    )

    expect(fbCommentAutomationService.createInstagram).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      type: "instagram",
      data: { name: "Welcome" },
    })
  })
})

describe("PUT /v1/ig-comments/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ig-comments/{id}")

  test("updates an IG comment automation in the token workspace", async () => {
    const input = { id: "ig-comment-1", name: "Updated welcome" }
    const updated = { ...input }
    fbCommentAutomationService.updateInstagram.mockResolvedValueOnce(updated)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      updated,
    )

    expect(fbCommentAutomationService.updateInstagram).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "ig-comment-1" },
      { name: "Updated welcome" },
    )
  })

  test("never forwards a client-supplied type into the update payload", async () => {
    const input = {
      id: "ig-comment-1",
      name: "Updated welcome",
      type: "instagramFacebook",
    }
    fbCommentAutomationService.updateInstagram.mockResolvedValueOnce({
      ...input,
    })

    await procedure.handler?.({ context, input })

    expect(fbCommentAutomationService.updateInstagram).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "ig-comment-1" },
      { name: "Updated welcome" },
    )
  })
})

describe("DELETE /v1/ig-comments/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ig-comments/{id}")

  test("deletes an IG comment automation in the token workspace", async () => {
    fbCommentAutomationService.deleteInstagram.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "ig-comment-1" } }),
    ).resolves.toBeUndefined()

    expect(fbCommentAutomationService.deleteInstagram).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "ig-comment-1",
    })
  })

  test("preserves the declared not-found error from the delete action", async () => {
    fbCommentAutomationService.deleteInstagram.mockRejectedValueOnce(
      new Error("Instagram Comment Automation not found"),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("Instagram Comment Automation not found")

    expect(fbCommentAutomationService.deleteInstagram).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "missing",
    })
  })
})

describe("GET /v1/ig-comments/instagram-media", () => {
  const procedure = findProcedure("GET", "/v1/ig-comments/instagram-media")

  test("lists Instagram Login media when variant is instagram", async () => {
    const response = { posts: [], pages: [] }
    listInstagramLoginMedia.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({ context, input: { variant: "instagram" } }),
    ).resolves.toEqual(response)

    expect(listInstagramLoginMedia).toHaveBeenCalledWith("workspace-1")
    expect(listInstagramFacebookMedia).not.toHaveBeenCalled()
  })

  test("lists Instagram-via-Facebook media otherwise", async () => {
    const response = { posts: [], pages: [] }
    listInstagramFacebookMedia.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { variant: "instagramFacebook" },
      }),
    ).resolves.toEqual(response)

    expect(listInstagramFacebookMedia).toHaveBeenCalledWith("workspace-1")
  })
})
