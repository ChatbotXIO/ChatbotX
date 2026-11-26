import { describe, expect, test, vi } from "vitest"
import { collectMediaMetrics } from "../src/apis/post"
import { InstagramAPIException } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

const media = (id: string, comments: number | null) => ({
  authorExternalId: null,
  authorName: null,
  caption: "x",
  commentsCount: comments,
  contentType: null,
  externalPostId: id,
  liveStatus: null,
  mediaType: null,
  permalink: null,
  publishedAt: null,
  reactionsCount: 3,
  sharesCount: null,
  thumbnailUrl: null,
  viewsCount: null,
})

describe("collectMediaMetrics", () => {
  test("keeps only the counts of each media read", async () => {
    const readOne = vi.fn((id: string) => Promise.resolve(media(id, 5)))

    const items = await collectMediaMetrics({
      postIds: ["a", "b"],
      readOne,
      toChannelError: mapToChannelError,
    })

    expect(items).toEqual([
      {
        commentsCount: 5,
        externalPostId: "a",
        reactionsCount: 3,
        sharesCount: null,
        viewsCount: null,
      },
      expect.objectContaining({ externalPostId: "b" }),
    ])
  })

  test("a media the platform no longer has is left out and the batch goes on", async () => {
    const readOne = vi
      .fn()
      .mockRejectedValueOnce(
        new InstagramAPIException("gone", 400, 100, 33, "GraphMethodException"),
      )
      .mockResolvedValueOnce(media("b", 1))

    const items = await collectMediaMetrics({
      postIds: ["a", "b"],
      readOne,
      toChannelError: mapToChannelError,
    })

    expect(items.map((item) => item.externalPostId)).toEqual(["b"])
  })

  test.each([
    ["an expired token (190)", 190, "auth_failed"],
    ["a rate limit (4)", 4, "rate_limited"],
    ["a user rate limit (17)", 17, "rate_limited"],
  ])("%s ends the batch after the first read, as the connector's own exception", async (_label, code, category) => {
    const readOne = vi
      .fn()
      .mockRejectedValue(new InstagramAPIException("denied", 400, code))

    await expect(
      collectMediaMetrics({
        postIds: ["a", "b", "c"],
        readOne,
        toChannelError: mapToChannelError,
      }),
    ).rejects.toMatchObject({ category })
    expect(readOne).toHaveBeenCalledTimes(1)
  })

  test("a rate limit reported only as a reason (80002) also ends the batch", async () => {
    const readOne = vi
      .fn()
      .mockRejectedValue(
        new InstagramAPIException("too many calls", 400, 80_002),
      )

    await expect(
      collectMediaMetrics({
        postIds: ["a", "b", "c"],
        readOne,
        toChannelError: mapToChannelError,
      }),
    ).rejects.toBeDefined()
    expect(readOne).toHaveBeenCalledTimes(1)
  })

  test("a media answered with a permission error is left out and the batch goes on", async () => {
    const readOne = vi
      .fn()
      .mockRejectedValueOnce(new InstagramAPIException("gone", 400, 10))
      .mockResolvedValueOnce(media("b", 2))

    const items = await collectMediaMetrics({
      postIds: ["a", "b"],
      readOne,
      toChannelError: mapToChannelError,
    })

    expect(items.map((item) => item.externalPostId)).toEqual(["b"])
  })

  test("three permission errors in a row before any read end the batch", async () => {
    const readOne = vi
      .fn()
      .mockRejectedValue(new InstagramAPIException("denied", 400, 10))

    await expect(
      collectMediaMetrics({
        postIds: ["a", "b", "c", "d", "e"],
        readOne,
        toChannelError: mapToChannelError,
      }),
    ).rejects.toMatchObject({ category: "permission_denied" })
    expect(readOne).toHaveBeenCalledTimes(3)
  })

  test("a different error between permission errors resets the run, so the batch goes on", async () => {
    const readOne = vi
      .fn()
      .mockRejectedValueOnce(new InstagramAPIException("denied", 400, 10))
      .mockRejectedValueOnce(
        new InstagramAPIException("gone", 400, 100, 33, "GraphMethodException"),
      )
      .mockRejectedValueOnce(new InstagramAPIException("denied", 400, 10))
      .mockRejectedValueOnce(new InstagramAPIException("denied", 400, 10))
      .mockResolvedValueOnce(media("e", 3))

    const items = await collectMediaMetrics({
      postIds: ["a", "b", "c", "d", "e"],
      readOne,
      toChannelError: mapToChannelError,
    })

    expect(items.map((item) => item.externalPostId)).toEqual(["e"])
  })
})
