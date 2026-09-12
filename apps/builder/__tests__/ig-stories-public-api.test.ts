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

const igStoryAutomationService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  igStoryAutomationService,
  quotaEnforcementService: {},
  userQuotaService: {},
}))

const listInstagramLoginStories = vi.fn()
const listInstagramFacebookStories = vi.fn()
vi.mock("@/features/ig-stories/lib/instagram-stories", () => ({
  listInstagramLoginStories,
  listInstagramFacebookStories,
}))

// The mock factory loads Zod after Vitest has applied module mocks.
vi.mock("@chatbotx.io/database/partials", async () => {
  const { z } = await import("zod")
  return {
    fbCommentIncludeKeywordsSchema: z.boolean(),
    fbCommentReplySchema: z.object({}),
    igStoryAutomationTypes: z.enum(["instagram", "facebook"]),
    igStoryTargetSchema: z.object({}),
  }
})

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    igStoryAutomationModel: {},
  }
})

await import("@/features/ig-stories/api/public")

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

test("registers the IG stories public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ig-stories", () => {
  const procedure = findProcedure("GET", "/v1/ig-stories")

  test("lists the workspace's Instagram Story Automations across every folder", async () => {
    const response = { data: [{ id: "story-1" }], pageCount: 1 }
    igStoryAutomationService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 1, perPage: 50, name: "Welcome" },
      }),
    ).resolves.toEqual(response)

    expect(igStoryAutomationService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      name: "Welcome",
      includeAllFolders: true,
    })
  })
})

describe("GET /v1/ig-stories/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ig-stories/{id}")

  test("gets a single Instagram Story Automation in the token workspace", async () => {
    const record = { id: "story-1", name: "Welcome" }
    igStoryAutomationService.findOrFail.mockResolvedValueOnce(record)

    await expect(
      procedure.handler?.({ context, input: { id: "story-1" } }),
    ).resolves.toEqual(record)

    expect(igStoryAutomationService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "story-1",
    })
  })
})

describe("POST /v1/ig-stories", () => {
  const procedure = findProcedure("POST", "/v1/ig-stories")

  test("creates an Instagram Story Automation in the token workspace", async () => {
    const input = {
      name: "Welcome",
      type: "instagram",
      story: { id: "story-1", accountId: "account-1" },
      reply: { type: "text", text: "Hello" },
      includeKeywords: false,
    }
    const created = { id: "story-1", ...input }
    igStoryAutomationService.create.mockResolvedValueOnce(created)

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      created,
    )

    const { type, ...data } = input
    expect(igStoryAutomationService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      type,
      data,
    })
  })
})

describe("PUT /v1/ig-stories/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ig-stories/{id}")

  test("updates an Instagram Story Automation in the token workspace", async () => {
    const updated = { id: "story-1", name: "Renamed" }
    igStoryAutomationService.update.mockResolvedValueOnce(updated)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "story-1", name: "Renamed", isActive: false },
      }),
    ).resolves.toEqual(updated)

    expect(igStoryAutomationService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "story-1" },
      { name: "Renamed", isActive: false },
    )
  })

  test("never forwards a client-supplied type into the update payload", async () => {
    const input = {
      id: "story-1",
      name: "Renamed",
      type: "instagramFacebook",
    }
    igStoryAutomationService.update.mockResolvedValueOnce({ ...input })

    await procedure.handler?.({ context, input })

    expect(igStoryAutomationService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "story-1" },
      { name: "Renamed" },
    )
  })
})

describe("DELETE /v1/ig-stories/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ig-stories/{id}")

  test("deletes an Instagram Story Automation in the token workspace", async () => {
    igStoryAutomationService.delete.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "story-1" } }),
    ).resolves.toBeUndefined()

    expect(igStoryAutomationService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "story-1",
    })
  })

  test("propagates the declared not-found error", async () => {
    igStoryAutomationService.delete.mockRejectedValueOnce(
      new Error("Instagram Story Automation not found"),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("Instagram Story Automation not found")
  })
})

describe("GET /v1/ig-stories/instagram-stories", () => {
  const procedure = findProcedure("GET", "/v1/ig-stories/instagram-stories")

  test("lists Instagram Login stories when variant is instagram", async () => {
    const response = { stories: [], pages: [] }
    listInstagramLoginStories.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({ context, input: { variant: "instagram" } }),
    ).resolves.toEqual(response)

    expect(listInstagramLoginStories).toHaveBeenCalledWith("workspace-1")
    expect(listInstagramFacebookStories).not.toHaveBeenCalled()
  })

  test("lists Instagram-via-Facebook stories otherwise", async () => {
    const response = { stories: [], pages: [] }
    listInstagramFacebookStories.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { variant: "instagramFacebook" },
      }),
    ).resolves.toEqual(response)

    expect(listInstagramFacebookStories).toHaveBeenCalledWith("workspace-1")
  })
})
