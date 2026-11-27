import z from "zod"

export const triggerActions = z.enum([
  "startAnotherFlow",
  "startExternalStep",
  "addTag",
  "removeTag",
  "addSequence",
  "removeSequence",
  "setCustomField",
  "clearCustomField",
  "transferConversationToHuman",
  "sendMetaCapiEvent",
  "sendGoogleAdsConversion",
  "runGoogleSheet",
  "pipeline",
  "archiveConversation",
  "unarchiveConversation",
  "assignConversation",
  "unassignConversation",
  "disableBot",
  "enableBot",
])
export type TriggerAction = z.infer<typeof triggerActions>

/** Sequences one `addSequence` / `removeSequence` action may name; `addSequence` costs one enrollment transaction per id at run time. */
export const MAX_SEQUENCES_PER_TRIGGER_ACTION = 50

export const triggerEventTypes = z.enum([
  "tagApplied",
  "tagRemoved",
  "customFieldValueChanged",
  "contactInfoUpdated",
  "dateTimeBasedTrigger",
  "conversationTransferredToHuman",
  "conversationTransferredToBot",
  "newContact",
  "contactUnsubscribedFormBroadcast",
  "archived",
  "followUp",
  "conversationAssigned",
  "conversationUnassigned",
  "incomingCall",
  "missedAudioCall",
  "callEnded",
  "callRecorded",
  "callTranscribed",
  "pipelineItemCreated",
  "pipelineItemMovedToStage",
  "pipelineItemValueChanged",
  "pipelineItemStatusChanged",
  "pipelineItemPriorityChanged",
  "subscribedToSequence",
  "unsubscribedFromSequence",
  "shoppingCartSent",
  "userAskedAboutProduct",
  "cartAbandoned",
  "newOrder",
  "orderAccepted",
  "orderShipped",
  "orderConcluded",
  "orderCancelled",
  "orderPaid",
  "orderRefunded",
  "categoryAddedToCart",
  "productAddedToCart",
  "productRemovedFromCart",
  "productOrdered",
  "contactReferredANewContact",
  "contactReferredExistingContact",
  "contactBlockedBot",
  "contactUnblockedBot",
  "contactCommentedOnPost",
  "contactFirstCommentedOnPost",
])
export type TriggerEventType = z.infer<typeof triggerEventTypes>

/**
 * The two post-comment events. A contact leaving a comment on a post of a
 * channel that tracks them (Messenger and Instagram today) fires
 * `contactCommentedOnPost` for every comment and
 * `contactFirstCommentedOnPost` for the first one of that contact on that post.
 */
export const postCommentEventTypes = z.enum([
  triggerEventTypes.enum.contactCommentedOnPost,
  triggerEventTypes.enum.contactFirstCommentedOnPost,
])
export type PostCommentEventType = z.infer<typeof postCommentEventTypes>

export const isPostCommentEventType = (
  type: string | undefined,
): type is PostCommentEventType => postCommentEventTypes.safeParse(type).success

/** Which posts a post-comment trigger condition listens to. */
export const postCommentScopes = z.enum([
  "any",
  "selected",
  "publishedFromPosts",
])
export type PostCommentScope = z.infer<typeof postCommentScopes>

/** Posts one `selected` condition may name. */
export const MAX_POSTS_PER_POST_COMMENT_CONDITION = 50

/**
 * `value` of a post-comment trigger condition. `scope` narrows the posts
 * (`any`, the `channelPostIds` picked with `selected`, or only posts that were
 * published from Posts); the condition's `sourceId` narrows the inbox (page or
 * account), null meaning any inbox.
 */
export const postCommentConditionValueSchema = z.object({
  scope: postCommentScopes.default(postCommentScopes.enum.any),
  channelPostIds: z
    .array(z.string())
    .max(MAX_POSTS_PER_POST_COMMENT_CONDITION)
    .default([]),
})
export type PostCommentConditionValue = z.infer<
  typeof postCommentConditionValueSchema
>

/**
 * Variables a post-comment trigger run adds, scoped to that one comment: they
 * render in the trigger's actions and in a flow the trigger starts, and mean
 * nothing anywhere else (they render empty, never a "latest post").
 */
export const POST_COMMENT_VARIABLE_NAMES = [
  "post.link",
  "post.text",
  "post.published_at",
  "post.page_name",
  "post.id",
  "comment.text",
  "comment.id",
] as const
export type PostCommentVariableName =
  (typeof POST_COMMENT_VARIABLE_NAMES)[number]
