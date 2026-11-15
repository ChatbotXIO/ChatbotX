import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import { toChannelPostTarget } from "../src/features/shared/comment-automation/lib/channel-post-target"
import { refinePostHashtags } from "../src/features/shared/comment-automation/lib/post-hashtags-validation"
import { useClearPostValueOnHashtagsSwitch } from "../src/features/shared/comment-automation/use-clear-post-value-on-hashtags-switch"
import {
  createThreadsCommentRequest,
  threadsCommentValidationKeys,
} from "../src/features/threads-comments/schema/action"

const threadsPayload = (post: { type: string; value: string[] }) => ({
  name: "Auto reply",
  post,
  publicReply: { type: "none", value: null },
  includeKeywords: { type: "all", value: [] },
  excludeKeywords: [],
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
  },
  replyAfter: { type: "immediately", value: 0 },
})

describe("toChannelPostTarget", () => {
  test("keeps a hashtags target and its list", () => {
    expect(toChannelPostTarget({ type: "hashtags", value: ["vip"] })).toEqual({
      type: "hashtags",
      value: ["vip"],
    })
  })

  test("reads a Meta-only type as all", () => {
    expect(toChannelPostTarget({ type: "reels", value: [] })).toEqual({
      type: "all",
      value: [],
    })
  })
})

describe("threads hashtags target", () => {
  test("accepts a hashtag list", () => {
    const parsed = createThreadsCommentRequest.parse(
      threadsPayload({ type: "hashtags", value: ["vip"] }),
    )
    expect(parsed.post).toEqual({ type: "hashtags", value: ["vip"] })
  })

  test("rejects an empty hashtag list", () => {
    expect(() =>
      createThreadsCommentRequest.parse(
        threadsPayload({ type: "hashtags", value: [] }),
      ),
    ).toThrow(threadsCommentValidationKeys.hashtagsRequired)
  })
})

describe("refinePostHashtags", () => {
  test("flags an empty hashtags target on post.value", () => {
    const addIssue = vi.fn()
    refinePostHashtags("required")({ post: { type: "hashtags", value: [] } }, {
      addIssue,
    } as never)
    expect(addIssue).toHaveBeenCalledWith(
      expect.objectContaining({ path: ["post", "value"], message: "required" }),
    )
  })

  test("ignores every other target", () => {
    const addIssue = vi.fn()
    refinePostHashtags("required")({ post: { type: "postIds", value: [] } }, {
      addIssue,
    } as never)
    expect(addIssue).not.toHaveBeenCalled()
  })
})

function Probe({ type, clear }: { type: string; clear: () => void }) {
  useClearPostValueOnHashtagsSwitch(type, clear)
  return null
}

/** Renders the hook through each post type in turn. */
function renderTypes(types: string[], clear: () => void) {
  const container = document.createElement("div")
  const root = createRoot(container)
  for (const type of types) {
    act(() => root.render(<Probe clear={clear} type={type} />))
  }
  act(() => root.unmount())
}

describe("useClearPostValueOnHashtagsSwitch", () => {
  test("never clears on the first render, so an edit keeps its list", () => {
    const clear = vi.fn()
    renderTypes(["hashtags"], clear)
    expect(clear).not.toHaveBeenCalled()
  })

  test("clears when switching between post ids and hashtags", () => {
    const clear = vi.fn()
    renderTypes(["postIds", "hashtags", "postIds"], clear)
    expect(clear).toHaveBeenCalledTimes(2)
  })

  test("keeps the list on a switch that does not involve hashtags", () => {
    const clear = vi.fn()
    renderTypes(["postIds", "all"], clear)
    expect(clear).not.toHaveBeenCalled()
  })
})
