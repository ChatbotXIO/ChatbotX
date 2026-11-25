import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ConditionEvaluationContext } from "../src/trigger/types"

const mocks = vi.hoisted(() => ({
  isPublishedFromPosts: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostService: { isPublishedFromPosts: mocks.isPublishedFromPosts },
  contactCustomFieldService: { findValue: vi.fn() },
  customFieldService: { findBy: vi.fn() },
}))

import { ConditionEvaluator } from "../src/trigger/services/condition-evaluator"

const workspace = { timezone: "UTC" } as WorkspaceModel

const COMMENT_EVENT = {
  channelPostId: "900",
  externalPostId: "page_post_1",
  inboxId: "7",
  channel: "messenger",
  commentId: "comment-1",
}

const context = (
  condition: Partial<ConditionEvaluationContext["condition"]>,
  type:
    | typeof triggerEventTypes.enum.contactCommentedOnPost
    | typeof triggerEventTypes.enum.contactFirstCommentedOnPost = triggerEventTypes
    .enum.contactCommentedOnPost,
): ConditionEvaluationContext =>
  ({
    condition: {
      type,
      sourceId: null,
      operator: null,
      value: null,
      ...condition,
    },
    eventData: {
      workspaceId: "ws-1",
      contactId: "contact-1",
      eventType: type,
      eventData: COMMENT_EVENT,
      timestamp: new Date(),
    },
    workspaceId: "ws-1",
    contactId: "contact-1",
    workspace,
  }) as ConditionEvaluationContext

describe("ConditionEvaluator post-comment conditions", () => {
  const evaluator = new ConditionEvaluator()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isPublishedFromPosts.mockResolvedValue(false)
  })

  test.each([
    triggerEventTypes.enum.contactCommentedOnPost,
    triggerEventTypes.enum.contactFirstCommentedOnPost,
  ] as const)("%s with nothing pinned matches any comment", async (type) => {
    await expect(evaluator.evaluate(context({}, type))).resolves.toBe(true)
    await expect(
      evaluator.evaluate(
        context({ value: { scope: "any", channelPostIds: [] } }, type),
      ),
    ).resolves.toBe(true)
  })

  test("a condition pinned to an inbox matches only that inbox's comments", async () => {
    await expect(evaluator.evaluate(context({ sourceId: "7" }))).resolves.toBe(
      true,
    )
    await expect(evaluator.evaluate(context({ sourceId: "8" }))).resolves.toBe(
      false,
    )
  })

  test("selected posts match only a comment on one of them", async () => {
    await expect(
      evaluator.evaluate(
        context({ value: { scope: "selected", channelPostIds: ["1", "900"] } }),
      ),
    ).resolves.toBe(true)
    await expect(
      evaluator.evaluate(
        context({ value: { scope: "selected", channelPostIds: ["1", "2"] } }),
      ),
    ).resolves.toBe(false)
    await expect(
      evaluator.evaluate(
        context({ value: { scope: "selected", channelPostIds: [] } }),
      ),
    ).resolves.toBe(false)
  })

  test("the inbox and the posts must both match", async () => {
    await expect(
      evaluator.evaluate(
        context({
          sourceId: "8",
          value: { scope: "selected", channelPostIds: ["900"] },
        }),
      ),
    ).resolves.toBe(false)
  })

  test("publishedFromPosts asks, in this workspace, whether Posts published the post", async () => {
    mocks.isPublishedFromPosts.mockResolvedValueOnce(true)
    await expect(
      evaluator.evaluate(
        context({ value: { scope: "publishedFromPosts", channelPostIds: [] } }),
      ),
    ).resolves.toBe(true)
    expect(mocks.isPublishedFromPosts).toHaveBeenCalledWith({
      channelPostId: "900",
      workspaceId: "ws-1",
    })

    await expect(
      evaluator.evaluate(
        context({ value: { scope: "publishedFromPosts", channelPostIds: [] } }),
      ),
    ).resolves.toBe(false)
  })

  test("a stored value that cannot be read narrows to nothing, never to any post", async () => {
    await expect(
      evaluator.evaluate(context({ value: { scope: "everything" } })),
    ).resolves.toBe(false)
    await expect(
      evaluator.evaluate(context({ value: "garbage" })),
    ).resolves.toBe(false)
  })
})
