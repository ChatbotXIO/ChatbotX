import {
  MAX_POSTS_PER_POST_COMMENT_CONDITION,
  type PostCommentEventType,
  type PostCommentScope,
  postCommentEventTypes,
  postCommentScopes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
import z from "zod"

const NO_POSTS: string[] = []

const postCommentValue = z
  .object({
    scope: postCommentScopes
      .default(postCommentScopes.enum.any)
      .describe(
        "Which posts the comment must be on: `any` (default), `selected` (only the posts in `channelPostIds`), or `publishedFromPosts` (only posts published from Posts).",
      ),
    channelPostIds: z
      .array(zodBigintIdAsString())
      .max(MAX_POSTS_PER_POST_COMMENT_CONDITION)
      .default(NO_POSTS)
      .describe(
        "Post ids (numeric strings, from `channelPosts.list`) for scope `selected`; ignored for the other scopes.",
      ),
  })
  .refine(
    (value) =>
      value.scope !== postCommentScopes.enum.selected ||
      value.channelPostIds.length > 0,
    { message: "Required", path: ["channelPostIds"] },
  )
  // Posts only mean something for `selected`: the other scopes never store any.
  .transform((value) => ({
    scope: value.scope,
    channelPostIds:
      value.scope === postCommentScopes.enum.selected
        ? value.channelPostIds
        : NO_POSTS,
  }))

const createPostCommentCondition = <T extends PostCommentEventType>(type: T) =>
  z.object({
    id: zodBigintAsString()
      .optional()
      .describe(
        "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
      ),
    type: z
      .literal(type)
      .describe(
        `Condition type "${type}". Fires for a comment on a Messenger or Instagram post${
          type === triggerEventTypes.enum.contactFirstCommentedOnPost
            ? ", only the first time this contact comments on that post"
            : ", for every comment"
        }. Optionally narrowed to one inbox (\`sourceId\`) and to some posts (\`value\`).`,
      ),
    sourceId: z
      .union([zodBigintIdAsString(), z.literal("")])
      .nullish()
      .transform((inboxId) => inboxId || null)
      .describe(
        "Inbox id (numeric string, from `inboxes.list`) the post belongs to. Omit or null to match any inbox.",
      ),
    value: postCommentValue
      .nullish()
      .transform(
        (value) =>
          value ?? {
            scope: postCommentScopes.enum.any,
            channelPostIds: NO_POSTS,
          },
      )
      .describe("Which posts the condition listens to."),
  })

export const contactCommentedOnPost = createPostCommentCondition(
  triggerEventTypes.enum.contactCommentedOnPost,
)
export const contactFirstCommentedOnPost = createPostCommentCondition(
  triggerEventTypes.enum.contactFirstCommentedOnPost,
)

export const isPostCommentEvent = (
  type: string | undefined,
): type is PostCommentEventType =>
  type !== undefined && postCommentEventTypes.safeParse(type).success

export const postCommentDefaultFn =
  <T extends PostCommentEventType>(type: T) =>
  (): {
    type: T
    sourceId: null
    value: { scope: PostCommentScope; channelPostIds: string[] }
  } => ({
    type,
    sourceId: null,
    value: { scope: postCommentScopes.enum.any, channelPostIds: [] },
  })
