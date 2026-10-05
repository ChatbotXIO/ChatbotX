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

const commentAutomationService = {
  deleteMany: vi.fn(),
  findOrFail: vi.fn(),
  findMissedCommentsInProgress: vi.fn(),
}
const igStoryAutomationService = { deleteMany: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({
  commentAutomationService,
  igStoryAutomationService,
}))

const processMissedComments = vi.fn()
vi.mock(
  "@/features/shared/comment-automation/lib/missed-comments/process-missed-comments",
  () => ({ processMissedComments }),
)

// Channel post/media listers reach the provider APIs; never hit here.
vi.mock("@/features/fb-comments/lib/facebook-posts", () => ({
  listFacebookPostsForAutomation: vi.fn(),
}))
vi.mock("@/features/ig-comments/lib/instagram-media", () => ({
  listInstagramFacebookMedia: vi.fn(),
  listInstagramLoginMedia: vi.fn(),
}))
vi.mock("@/features/ig-comments/lib/ensure-live-comments-subscription", () => ({
  ensureLiveCommentsSubscriptionForAutomation: vi.fn(),
}))
vi.mock("@/features/ig-stories/lib/instagram-stories", () => ({
  listInstagramFacebookStories: vi.fn(),
  listInstagramLoginStories: vi.fn(),
}))
vi.mock("@/features/threads-comments/lib/threads-posts", () => ({
  listThreadsPostsForWorkspace: vi.fn(),
}))

await import("@/features/fb-comments/api/public")
await import("@/features/ig-comments/api/public")
await import("@/features/threads-comments/api/public")
await import("@/features/tiktok-comments/api/public")
await import("@/features/ig-stories/api/public")
await import("@/features/shared/comment-automation/api/public")

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

const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  ["fb-comments", ["messenger"]],
  ["ig-comments", ["instagram", "instagramFacebook"]],
  ["threads-comments", ["threads"]],
  ["tiktok-comments", ["tiktok"]],
])("POST /v1/%s/bulk-delete", (resource, types) => {
  test("deletes only this channel's automations in the token workspace", async () => {
    await findProcedure("POST", `/v1/${resource}/bulk-delete`).handler?.({
      context,
      input: { ids: ["1", "2"] },
    })

    expect(commentAutomationService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["1", "2"],
      types,
    })
  })
})

test("POST /v1/ig-stories/bulk-delete deletes in the token workspace", async () => {
  await findProcedure("POST", "/v1/ig-stories/bulk-delete").handler?.({
    context,
    input: { ids: ["1"] },
  })

  expect(igStoryAutomationService.deleteMany).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    ids: ["1"],
  })
})

describe("missed comment runs", () => {
  const path = "/v1/comment-automations/{id}/missed-comment-runs"

  test("POST starts a run for the token workspace and returns its result", async () => {
    const result = { status: "failed", reason: "alreadyRunning" }
    processMissedComments.mockResolvedValueOnce(result)

    await expect(
      findProcedure("POST", path).handler?.({ context, input: { id: "a-1" } }),
    ).resolves.toEqual(result)
    expect(processMissedComments).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "a-1",
    })
  })

  test("GET reports whether the automation is still processing", async () => {
    commentAutomationService.findOrFail.mockResolvedValueOnce({ id: "a-1" })
    commentAutomationService.findMissedCommentsInProgress.mockResolvedValueOnce(
      ["a-1"],
    )

    await expect(
      findProcedure("GET", path).handler?.({ context, input: { id: "a-1" } }),
    ).resolves.toEqual({ inProgress: true })
    expect(
      commentAutomationService.findMissedCommentsInProgress,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      automationIds: ["a-1"],
    })
  })

  test("GET 404s for an automation outside the workspace", async () => {
    const notFound = Object.assign(new Error("nf"), { code: "notFound" })
    commentAutomationService.findOrFail.mockRejectedValueOnce(notFound)

    await expect(
      findProcedure("GET", path).handler?.({ context, input: { id: "x" } }),
    ).rejects.toBe(notFound)
    expect(
      commentAutomationService.findMissedCommentsInProgress,
    ).not.toHaveBeenCalled()
  })
})
