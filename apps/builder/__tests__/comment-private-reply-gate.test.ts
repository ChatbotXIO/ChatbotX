import { describe, expect, test } from "vitest"
import { canPrivateReplyToComment } from "@/features/messages/lib/private-reply"

const comment = (contentAttributes: Record<string, unknown> | null) =>
  ({ contentAttributes }) as never

describe("canPrivateReplyToComment", () => {
  test.each([
    "messenger",
    "instagram",
    "instagramFacebook",
  ])("%s can DM any comment", (channel) => {
    expect(canPrivateReplyToComment({ channel, message: comment(null) })).toBe(
      true,
    )
  })

  // Threads has no DM endpoint at all; the button used to be offered anyway and
  // threw "comment.sendPrivateReply not registered" on click.
  test("threads never offers a private reply", () => {
    expect(
      canPrivateReplyToComment({
        channel: "threads",
        message: comment({ tiktokHighIntent: { at: "2026-01-01" } }),
      }),
    ).toBe(false)
  })

  // TikTok decides per comment, not per channel: Comment-to-Message only
  // accepts a comment its own classifier flagged.
  test("tiktok offers it only on a flagged comment", () => {
    expect(
      canPrivateReplyToComment({
        channel: "tiktok",
        message: comment({ tiktokHighIntent: { at: "2026-01-01" } }),
      }),
    ).toBe(true)
    expect(
      canPrivateReplyToComment({
        channel: "tiktok",
        message: comment({ postId: "video-1" }),
      }),
    ).toBe(false)
    expect(
      canPrivateReplyToComment({ channel: "tiktok", message: comment(null) }),
    ).toBe(false)
  })

  test("an unknown or missing channel is refused", () => {
    expect(
      canPrivateReplyToComment({ channel: null, message: comment(null) }),
    ).toBe(false)
    expect(
      canPrivateReplyToComment({ channel: "webchat", message: comment(null) }),
    ).toBe(false)
  })
})
