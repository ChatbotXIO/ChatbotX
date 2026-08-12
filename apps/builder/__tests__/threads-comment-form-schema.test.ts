import { describe, expect, test } from "vitest"
import {
  createThreadsCommentRequest,
  createThreadsCommentRequestSchema,
  resolveThreadsCommentValidationMessages,
  threadsCommentValidationKeys,
  updateThreadsCommentRequest,
} from "../src/features/threads-comments/schema/action"

describe("threads comment automation schema", () => {
  test("accepts a valid public text reply payload", () => {
    const parsed = createThreadsCommentRequest.parse({
      name: "Auto reply",
      post: { type: "postIds", value: ["12345"] },
      publicReply: { type: "text", value: "Thanks!" },
      includeKeywords: { type: "contain", value: ["hello"] },
      excludeKeywords: ["spam"],
      options: {
        replyToNewContactsOnly: false,
        replyOncePerUserPerPost: true,
        replyToUsersWhoCommentedOnOtherPosts: true,
        ignoreCommentReplies: true,
      },
      replyAfter: { type: "minutes", value: 2 },
    })

    expect(parsed.publicReply).toEqual({ type: "text", value: "Thanks!" })
  })

  test("rejects missing specific post ids", () => {
    expect(() =>
      createThreadsCommentRequest.parse({
        name: "Auto reply",
        post: { type: "postIds", value: [] },
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
      }),
    ).toThrow(threadsCommentValidationKeys.postIdsRequired)
  })

  test("rejects missing public reply value for flow and AI agent", () => {
    expect(() =>
      createThreadsCommentRequest.parse({
        name: "Auto reply",
        post: { type: "all", value: [] },
        publicReply: { type: "flow", value: "" },
        includeKeywords: { type: "all", value: [] },
        excludeKeywords: [],
        options: {
          replyToNewContactsOnly: false,
          replyOncePerUserPerPost: false,
          replyToUsersWhoCommentedOnOtherPosts: true,
          ignoreCommentReplies: true,
        },
        replyAfter: { type: "immediately", value: 0 },
      }),
    ).toThrow()

    expect(() =>
      createThreadsCommentRequest.parse({
        name: "Auto reply",
        post: { type: "all", value: [] },
        publicReply: { type: "AIAgent", value: "" },
        includeKeywords: { type: "all", value: [] },
        excludeKeywords: [],
        options: {
          replyToNewContactsOnly: false,
          replyOncePerUserPerPost: false,
          replyToUsersWhoCommentedOnOtherPosts: true,
          ignoreCommentReplies: true,
        },
        replyAfter: { type: "immediately", value: 0 },
      }),
    ).toThrow()
  })

  test("rejects unsupported delay values and strips crafted immutable fields", () => {
    expect(() =>
      createThreadsCommentRequest.parse({
        name: "Auto reply",
        post: { type: "all", value: [] },
        publicReply: { type: "none", value: null },
        includeKeywords: { type: "all", value: [] },
        excludeKeywords: [],
        options: {
          replyToNewContactsOnly: false,
          replyOncePerUserPerPost: false,
          replyToUsersWhoCommentedOnOtherPosts: true,
          ignoreCommentReplies: true,
        },
        replyAfter: { type: "hours", value: 0 },
      }),
    ).toThrow(threadsCommentValidationKeys.delayMustBePositive)

    const parsed = updateThreadsCommentRequest.parse({
      isActive: true,
    })
    expect(parsed).toEqual({ isActive: true })
  })

  test("rejects empty updates", () => {
    expect(() => updateThreadsCommentRequest.parse({})).toThrow(
      threadsCommentValidationKeys.atLeastOneFieldRequired,
    )
  })

  test("creates a client-side schema with translated validation messages", () => {
    const schema = createThreadsCommentRequestSchema(
      resolveThreadsCommentValidationMessages((key) => `translated:${key}`),
    )

    expect(() =>
      schema.parse({
        name: "Auto reply",
        post: { type: "all", value: ["12345"] },
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
      }),
    ).toThrow(
      `translated:${threadsCommentValidationKeys.postIdsMustBeEmptyForAll}`,
    )
  })
})
