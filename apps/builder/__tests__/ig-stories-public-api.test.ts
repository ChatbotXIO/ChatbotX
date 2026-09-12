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
  handler?: (...args: unknown[]) => Promise<unknown>
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
      handler: vi.fn((fn: (...args: unknown[]) => Promise<unknown>) => {
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

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: {},
  userQuotaService: {},
}))

const listIgStories = vi.fn()
vi.mock("@/features/ig-stories/queries", () => ({ listIgStories }))

const createIgStory = vi.fn()
vi.mock("@/features/ig-stories/actions/create-ig-story.action", () => ({
  createIgStory,
}))

const updateIgStory = vi.fn()
vi.mock("@/features/ig-stories/actions/update-ig-story.action", () => ({
  updateIgStory,
}))

const deleteIgStory = vi.fn()
vi.mock("@/features/ig-stories/actions/delete-ig-story.action", () => ({
  deleteIgStory,
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

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the IG stories public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ig-stories", () => {
  const procedure = findProcedure("GET", "/v1/ig-stories")

  test("lists the workspace's Instagram Story Automations", async () => {
    const response = { data: [{ id: "story-1" }], pageCount: 1 }
    listIgStories.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 1, perPage: 50, name: "Welcome" },
      }),
    ).resolves.toEqual(response)

    expect(listIgStories).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      name: "Welcome",
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
    createIgStory.mockResolvedValueOnce(created)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input,
      }),
    ).resolves.toEqual(created)

    expect(createIgStory).toHaveBeenCalledWith("workspace-1", input)
  })
})

describe("PUT /v1/ig-stories/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ig-stories/{id}")

  test("updates an Instagram Story Automation in the token workspace", async () => {
    const updated = { id: "story-1", name: "Renamed" }
    updateIgStory.mockResolvedValueOnce(updated)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "story-1", name: "Renamed", isActive: false },
      }),
    ).resolves.toEqual(updated)

    expect(updateIgStory).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "story-1" },
      { name: "Renamed", isActive: false },
    )
  })
})

describe("DELETE /v1/ig-stories/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ig-stories/{id}")

  test("deletes an Instagram Story Automation in the token workspace", async () => {
    deleteIgStory.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "story-1" },
      }),
    ).resolves.toBeUndefined()

    expect(deleteIgStory).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "story-1",
    })
  })

  test("propagates the declared not-found error", async () => {
    deleteIgStory.mockRejectedValueOnce(
      new Error("Instagram Story Automation not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("Instagram Story Automation not found")
  })
})
