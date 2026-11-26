import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: { get: vi.fn(), postWithHeaders: vi.fn() },
}))

const { getPostsMetrics } = await import("../src/apis/post")
const { facebookGraphClient } = await import("../src/lib/http-client")

const FIRST_SUB_REQUEST =
  /^v\d+\.\d+\/p_1\?fields=id,shares,comments\.limit\(0\)\.summary\(true\)\.filter\(stream\),reactions\.limit\(0\)\.summary\(true\)$/

const mockBatch = facebookGraphClient.postWithHeaders as MockInstance

const auth = {
  metadata: { pageId: "page-1" },
  tokens: { accessToken: "page-token" },
} as never

const ok = (body: Record<string, unknown>) => ({
  body: JSON.stringify(body),
  code: 200,
})

const answer = (subResponses: unknown[]) =>
  mockBatch.mockResolvedValue({ data: subResponses, headers: new Headers() })

const node = (id: string, counts = { comments: 4, reactions: 9, shares: 2 }) =>
  ok({
    comments: { summary: { total_count: counts.comments } },
    id,
    reactions: { summary: { total_count: counts.reactions } },
    shares: { count: counts.shares },
  })

describe("getPostsMetrics", () => {
  beforeEach(() => {
    mockBatch.mockReset()
  })

  test("reads the counts of several posts in ONE Graph batch call", async () => {
    answer([node("p_1"), node("p_2")])

    const items = await getPostsMetrics({ auth, postIds: ["p_1", "p_2"] })

    expect(mockBatch).toHaveBeenCalledTimes(1)
    const form = mockBatch.mock.calls[0][1].body as URLSearchParams
    const batch = JSON.parse(form.get("batch") ?? "[]")
    expect(batch).toHaveLength(2)
    expect(batch[0]).toEqual({
      method: "GET",
      relative_url: expect.stringMatching(FIRST_SUB_REQUEST),
    })
    expect(items).toEqual([
      {
        commentsCount: 4,
        externalPostId: "p_1",
        reactionsCount: 9,
        sharesCount: 2,
        viewsCount: null,
      },
      expect.objectContaining({ externalPostId: "p_2" }),
    ])
  })

  test("a post the batch has no answer for is left out, never zeroed", async () => {
    answer([
      node("p_1"),
      null,
      {
        body: JSON.stringify({
          error: { code: 100, message: "Unsupported get request" },
        }),
        code: 400,
      },
    ])

    const items = await getPostsMetrics({
      auth,
      postIds: ["p_1", "p_2", "p_3"],
    })

    expect(items.map((item) => item.externalPostId)).toEqual(["p_1"])
  })

  test("a count the node leaves out is unknown; a post nobody shared has zero shares", async () => {
    answer([ok({ id: "p_1" })])

    const [item] = await getPostsMetrics({ auth, postIds: ["p_1"] })

    expect(item).toEqual({
      commentsCount: null,
      externalPostId: "p_1",
      reactionsCount: null,
      sharesCount: 0,
      viewsCount: null,
    })
  })

  test("an unreadable sub-response is skipped", async () => {
    answer([{ body: "not json", code: 200 }, node("p_2")])

    const items = await getPostsMetrics({ auth, postIds: ["p_1", "p_2"] })

    expect(items.map((item) => item.externalPostId)).toEqual(["p_2"])
  })

  // Graph's real answer for a deleted or unreadable post inside a batch.
  const objectGone = {
    body: JSON.stringify({
      error: {
        code: 10,
        message:
          "(#10) Object does not exist, cannot be loaded due to missing permission or reviewable feature, or does not support this operation.",
        type: "OAuthException",
      },
    }),
    code: 400,
  }

  test("a post Graph answers with code 10 (gone or unreadable) is left out and the other posts are still read", async () => {
    answer([objectGone, node("p_2", { comments: 1, reactions: 0, shares: 0 })])

    const items = await getPostsMetrics({ auth, postIds: ["p_1", "p_2"] })

    expect(items).toEqual([
      expect.objectContaining({ commentsCount: 1, externalPostId: "p_2" }),
    ])
  })

  test("when no post of the batch can be read for a permission error, the permission error is thrown", async () => {
    answer([objectGone, objectGone])

    await expect(
      getPostsMetrics({ auth, postIds: ["p_1", "p_2"] }),
    ).rejects.toMatchObject({ category: "permission_denied" })
  })

  test("an expired token ends the batch with a channel error", async () => {
    answer([
      {
        body: JSON.stringify({
          error: { code: 190, message: "Error validating access token" },
        }),
        code: 401,
      },
    ])

    await expect(
      getPostsMetrics({ auth, postIds: ["p_1"] }),
    ).rejects.toMatchObject({ category: "auth_failed" })
  })

  test("a rate limit ends the batch with a retryable channel error", async () => {
    answer([
      {
        body: JSON.stringify({
          error: { code: 4, message: "Application request limit reached" },
        }),
        code: 400,
      },
    ])

    await expect(
      getPostsMetrics({ auth, postIds: ["p_1"] }),
    ).rejects.toMatchObject({ category: "rate_limited" })
  })

  test("a batch call that fails as a whole is thrown", async () => {
    mockBatch.mockRejectedValue(new Error("network down"))

    await expect(getPostsMetrics({ auth, postIds: ["p_1"] })).rejects.toThrow()
  })

  test("asks nothing for an empty list", async () => {
    expect(await getPostsMetrics({ auth, postIds: [] })).toEqual([])
    expect(mockBatch).not.toHaveBeenCalled()
  })
})
