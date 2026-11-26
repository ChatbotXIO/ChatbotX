import { describe, expect, test } from "vitest"
import { withCommentLiked } from "@/features/channel-posts/lib/comment-like-cache"

const cache = () => ({
  pageParams: [undefined],
  pages: [
    {
      items: [
        { id: "1", liked: false },
        { id: "2", liked: false },
      ],
    },
    { items: [{ id: "3", liked: true }] },
  ],
})

describe("withCommentLiked", () => {
  test("sets the flag of the one comment and leaves the rest alone", () => {
    const next = withCommentLiked(cache(), "2", true)

    expect(next?.pages[0]?.items).toEqual([
      { id: "1", liked: false },
      { id: "2", liked: true },
    ])
    expect(next?.pages[1]?.items).toEqual([{ id: "3", liked: true }])
    expect(next?.pageParams).toEqual([undefined])
  })

  test("removes a like", () => {
    expect(
      withCommentLiked(cache(), "3", false)?.pages[1]?.items[0]?.liked,
    ).toBe(false)
  })

  test("does not mutate the cached object", () => {
    const original = cache()
    withCommentLiked(original, "1", true)

    expect(original.pages[0]?.items[0]?.liked).toBe(false)
  })

  test("passes an empty cache through", () => {
    expect(withCommentLiked(undefined, "1", true)).toBeUndefined()
  })
})
