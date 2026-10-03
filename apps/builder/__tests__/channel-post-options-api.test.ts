// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>

type CapturedProcedure = {
  handler?: Handler
  path: string
}

const {
  authorizedAPI,
  capturedProcedures,
  workspaceAuthorizedMidddleware,
  workspaceTokenAuthAPIForScope,
} = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = () => {
    let path = ""
    const chain = {
      errors: vi.fn(() => chain),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      route: vi.fn((config: { path: string }) => {
        path = config.path
        return chain
      }),
      use: vi.fn(() => chain),
      handler: vi.fn((handler: Handler) => {
        capturedProcedures.push({ handler, path })
        return { handler }
      }),
    }
    return chain
  }

  return {
    authorizedAPI: makeProcedure(),
    capturedProcedures,
    workspaceAuthorizedMidddleware: vi.fn(),
    workspaceTokenAuthAPIForScope: vi.fn(() => makeProcedure()),
  }
})

const listFilterOptions = vi.fn()
const findByIds = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  channelPostService: { findByIds, listFilterOptions },
}))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))
vi.mock("@/orpc", () => ({
  authorizedAPI,
  workspaceTokenAuthAPIForScope,
}))

await import("@/features/channel-posts/api")
await import("@/features/channel-posts/api/public")
const { channelPostCursor, channelPostId, channelPostOption } = await import(
  "@/features/channel-posts/schema"
)

const findHandler = (path: string): Handler => {
  const handler = capturedProcedures.find(
    (procedure) => procedure.path === path,
  )?.handler
  if (!handler) {
    throw new Error(`Missing handler for ${path}`)
  }
  return handler
}

const listHandler = findHandler(
  "/workspaces/{workspaceId}/channel-posts/options",
)
const byIdsHandler = findHandler(
  "/workspaces/{workspaceId}/channel-posts/options/by-ids",
)
const publicListHandler = findHandler("/v1/channel-posts")
const publicByIdsHandler = findHandler("/v1/channel-posts/options/by-ids")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("channel post filter option APIs", () => {
  test("rejects malformed ids and impossible keyset cursor timestamps without throwing", () => {
    expect(() => channelPostId.safeParse("bad")).not.toThrow()
    expect(() => channelPostId.safeParse("1.5")).not.toThrow()
    expect(channelPostId.safeParse("bad").success).toBe(false)
    expect(channelPostId.safeParse("1.5").success).toBe(false)
    expect(
      channelPostCursor.safeParse({
        id: "1",
        sortAt: "2026-02-28T23:59:59.123456+07:00",
      }).success,
    ).toBe(true)
    expect(
      channelPostCursor.safeParse({
        id: "1",
        sortAt: "2026-99-99T99:99:99Z",
      }).success,
    ).toBe(false)
  })

  test("the option contract carries the channel and rejects an unknown one", () => {
    const option = {
      caption: null,
      channel: "instagram",
      externalPostId: "1780",
      id: "1",
      inboxId: "2",
      inboxName: "Inbox",
      permalink: null,
      publishedAt: null,
      thumbnailUrl: null,
    }

    expect(channelPostOption.safeParse(option).success).toBe(true)
    expect(
      channelPostOption.safeParse({ ...option, channel: "not-a-channel" })
        .success,
    ).toBe(false)
    // The removed per-integration field must not be accepted in its place.
    const { channel: _channel, ...withoutChannel } = option
    expect(
      channelPostOption.safeParse({
        ...withoutChannel,
        integrationType: "instagram",
      }).success,
    ).toBe(false)
  })

  test("uses the same scoped service method for private and public lists", async () => {
    const response = { items: [], nextCursor: undefined }
    listFilterOptions.mockResolvedValue(response)

    await expect(
      listHandler({
        input: { limit: 30, search: "summer", workspaceId: "workspace-1" },
      }),
    ).resolves.toEqual(response)
    await expect(
      publicListHandler({
        context: { workspace: { id: "workspace-2" } },
        input: { limit: 30, search: "summer" },
      }),
    ).resolves.toEqual(response)

    expect(listFilterOptions).toHaveBeenNthCalledWith(1, {
      limit: 30,
      search: "summer",
      workspaceId: "workspace-1",
    })
    expect(listFilterOptions).toHaveBeenNthCalledWith(2, {
      limit: 30,
      search: "summer",
      workspaceId: "workspace-2",
    })
  })

  test("resolves saved-filter labels through the same workspace-scoped service", async () => {
    const response = [{ id: "post-1" }]
    findByIds.mockResolvedValue(response)

    await expect(
      byIdsHandler({
        input: { ids: ["post-1"], workspaceId: "workspace-1" },
      }),
    ).resolves.toEqual({ data: response })
    await expect(
      publicByIdsHandler({
        context: { workspace: { id: "workspace-2" } },
        input: { ids: ["post-1"] },
      }),
    ).resolves.toEqual({ data: response })

    expect(findByIds).toHaveBeenNthCalledWith(1, {
      ids: ["post-1"],
      workspaceId: "workspace-1",
    })
    expect(findByIds).toHaveBeenNthCalledWith(2, {
      ids: ["post-1"],
      workspaceId: "workspace-2",
    })
  })
})
