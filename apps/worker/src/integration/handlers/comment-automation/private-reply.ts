import { conversationService } from "@chatbotx.io/business"
import type { CommentReply } from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { COMMENT_AUTOMATION_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
import {
  type InstagramAuthValue,
  sendPrivateReply as sendInstagramLoginPrivateReply,
} from "@chatbotx.io/integration-instagram"
import {
  type InstagramAuthValue as InstagramFacebookAuthValue,
  sendPrivateReply as sendInstagramFacebookPrivateReply,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  type MessengerAuthValue,
  sendPrivateReply,
} from "@chatbotx.io/integration-messenger"
import {
  sendPrivateReply as sendTiktokPrivateReply,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import { applySpintax } from "@chatbotx.io/utils/spintax"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  AIJobAction,
  aiAgentQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { TIKTOK_HIGH_INTENT_ATTRIBUTE } from "../tiktok-high-intent-comment"
import type { CommentAutomationChannelType } from "./channel-type"
import type { CommentAutomationDedup } from "./dedup"
import { type CommentReplyOutcome, describeFlowReply } from "./reply-outcome"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long after a comment its channel still accepts a comment-anchored DM.
 *
 * Meta allows 7 days (Instagram Live is stricter still: during the broadcast
 * only). TikTok allows 48 hours. Past that the Send API rejects the call, so a
 * backlogged queue or a long `replyAfter` would surface as an opaque channel
 * error instead of a skip.
 *
 * Threads has no DM at all, so its entry is never consulted — zero rather than
 * a number that would read as a real allowance.
 */
const PRIVATE_REPLY_WINDOW_MS_BY_CHANNEL: Record<
  CommentAutomationChannelType,
  number
> = {
  messenger: 7 * DAY_MS,
  instagram: 7 * DAY_MS,
  instagramFacebook: 7 * DAY_MS,
  threads: 0,
  tiktok: 2 * DAY_MS,
}

/** The window in words, for an `errorDetail` a workspace has to act on. */
const PRIVATE_REPLY_WINDOW_LABEL: Record<CommentAutomationChannelType, string> =
  {
    messenger: "Meta's 7-day private reply window",
    instagram: "Meta's 7-day private reply window",
    instagramFacebook: "Meta's 7-day private reply window",
    threads: "the private reply window",
    tiktok: "TikTok's 48-hour Comment-to-Message window",
  }

export const privateReplyWindowLabel = (
  channelType: CommentAutomationChannelType,
): string => PRIVATE_REPLY_WINDOW_LABEL[channelType]

/**
 * Whether the DM would leave after the channel's comment window has closed.
 *
 * `delay` is part of the answer because the DM only leaves once the job's delay
 * has elapsed, so a comment still inside the window *now* can fall outside it by
 * then.
 *
 * Exported because the caller gates on this before dispatching, so it can
 * record the blocked delivery on the automation's analytics timeline —
 * `executePrivateReply` still checks it too, but by then there is no caller
 * context to record with. Both sides must pass the same `channelType` or the
 * "defence in depth" check below stops agreeing with the gate.
 */
export function isOutsidePrivateReplyWindow(props: {
  channelType: CommentAutomationChannelType
  createdTime: number
  delay: number
}): boolean {
  const commentAgeAtSendMs = Date.now() + props.delay - props.createdTime * 1000
  return (
    commentAgeAtSendMs > PRIVATE_REPLY_WINDOW_MS_BY_CHANNEL[props.channelType]
  )
}

/**
 * Channels whose DM is permitted only for a comment the channel itself singled
 * out, rather than for any comment the automation matched.
 *
 * TikTok is the only one: Comment-to-Message accepts a `comment_id` only after
 * its own classifier flags the comment as high intent, reported on a separate
 * webhook that may arrive long after — or never. So the private branch cannot
 * be dispatched on the `comment.update` pass the way Meta's is; it is deferred
 * until the flag shows up. An allowlist, so a new channel keeps the ordinary
 * immediate behaviour unless someone opts it in deliberately.
 */
const CHANNELS_WITH_CONDITIONAL_PRIVATE_REPLY = new Set<string>(["tiktok"])

export function privateReplyRequiresHighIntent(
  channelType: CommentAutomationChannelType,
): boolean {
  return CHANNELS_WITH_CONDITIONAL_PRIVATE_REPLY.has(channelType)
}

/**
 * Whether TikTok has flagged this comment as high intent, read off the comment
 * message's own `contentAttributes` where the `im_receive_high_intent_comment`
 * handler merges it.
 */
export function isCommentFlaggedHighIntent(
  contentAttributes: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(contentAttributes?.[TIKTOK_HIGH_INTENT_ATTRIBUTE])
}

export type PrivateReplyAuth =
  | MessengerAuthValue
  | InstagramAuthValue
  | InstagramFacebookAuthValue
  | TiktokAuthValue

export type PrivateReplyTextSender = (
  auth: PrivateReplyAuth,
  commentId: string,
  text: string,
) => Promise<unknown>

/**
 * How each channel delivers the private (DM) half of a comment automation.
 * `null` means the channel has no private-reply API at all — the single source
 * of truth for `supportsPrivateReply`, so a channel can never be "supported"
 * without a sender to back it.
 */
export const PRIVATE_REPLY_TEXT_SENDERS: Record<
  CommentAutomationChannelType,
  PrivateReplyTextSender | null
> = {
  messenger: (auth, commentId, text) =>
    sendPrivateReply(auth as MessengerAuthValue, commentId, text),
  // Instagram Login sends the private DM through the me/messages endpoint,
  // addressing the commenter by comment id.
  instagram: (auth, commentId, text) =>
    sendInstagramLoginPrivateReply(auth as InstagramAuthValue, commentId, text),
  // Instagram via Facebook Login sends the private DM through the
  // {pageId}/messages endpoint (Page access token), addressing the commenter
  // by comment id — Meta exposes the `messages` edge only on the Page node for
  // this login type; the IG node answers with error #3.
  instagramFacebook: (auth, commentId, text) =>
    sendInstagramFacebookPrivateReply(
      auth as InstagramFacebookAuthValue,
      commentId,
      text,
    ),
  // The Threads API has no `private_replies` (or any DM) endpoint: a Threads
  // comment can only be answered publicly. Every private-reply path — text,
  // flow and AIAgent alike — therefore skips on Threads.
  threads: null,
  // Comment-to-Message: `direct_reply` on `business/message/send/` addresses
  // the DM by comment id, so unlike every other TikTok send it needs no
  // existing `conversation_id`. It is NOT the unconditional capability the Meta
  // channels have — TikTok only accepts a comment its own classifier flagged as
  // high intent — which is why `privateReplyRequiresHighIntent` gates dispatch
  // separately from this map.
  tiktok: (auth, commentId, text) =>
    sendTiktokPrivateReply(auth as TiktokAuthValue, commentId, text),
}

/**
 * Whether the channel can answer a comment with a private DM.
 *
 * Still read off the senders map, because dispatch is what "supported" means
 * here. `packages/analytics` needs the same answer to decide whether a public
 * reply moves the lifetime counters (`countsTowardStats`) and cannot import
 * this module — it would pull every Meta integration into the analytics
 * package — so the capability is duplicated as
 * `commentAutomationChannelSupportsPrivateReply` in `@chatbotx.io/database/partials`.
 * `comment-automation.test.ts` asserts the two agree for every channel: let
 * them drift and a channel's replies are dispatched one way and counted the
 * other.
 */
export function supportsPrivateReply(
  channelType: CommentAutomationChannelType,
): boolean {
  return PRIVATE_REPLY_TEXT_SENDERS[channelType] !== null
}

/**
 * A comment anchors its conversation to the post (`Conversation.sourceId =
 * postId`), but the contact's DM replies always land on the DM conversation
 * (`sourceId IS NULL`). Starting the flow on the comment conversation parks its
 * state — `currentStep` and `additionalAttributes.challenge` — where no reply
 * can reach it, so the flow never advances past its first waiting step and
 * nothing errors (#1063). Resolve the DM conversation instead; `commentAnchor`
 * rides the job separately and still delivers the first message through the
 * comment_id-anchored Send API.
 *
 * The `sourceId: null` fallback covers a contact whose first ever interaction
 * is this comment. It holds on every channel: the DM conversation is keyed by a
 * null sourceId everywhere, and a channel that needs its own conversation id to
 * address the DM (TikTok) carries it on
 * `additionalAttributes.channelConversationId` instead of in `sourceId`.
 */
async function resolveDirectMessageConversationId(ctx: {
  commentId: string
  conversationId: string
  contactInbox: ContactInboxModel
  workspaceId: string
}): Promise<string> {
  try {
    const existing = await conversationService.findDMByContact({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactInbox.contactId,
    })
    if (existing) {
      return existing.id
    }

    const created = await conversationService.findOrCreate({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactInbox.contactId,
      sourceId: null,
    })
    return created.id
  } catch (err) {
    // Fall back to the pre-#1063 behaviour (flow starts, on the wrong
    // conversation) rather than throwing: the caller would mark the dispatch
    // failed, skip the dedup row, and a job retry would post the public reply
    // a second time.
    logger.warn(
      { err, commentId: ctx.commentId, conversationId: ctx.conversationId },
      "Failed to resolve the DM conversation for a comment-triggered flow, falling back to the comment conversation",
    )
    return ctx.conversationId
  }
}

/**
 * Returns what was dispatched, or `null` when nothing was. The caller uses that
 * — not the automation's configuration — to decide whether to write the dedup
 * row and whether the comment's single private-reply budget has been spent. The
 * outcome also carries the text for the analytics event.
 */
export async function executePrivateReply(
  privateReply: CommentReply,
  ctx: {
    auth: PrivateReplyAuth
    integrationType: string
    integrationIdentifier: string
    automationId: string
    commentId: string
    channelType: CommentAutomationChannelType
    conversationId: string
    contactInboxId: string
    contactInbox: ContactInboxModel
    workspaceId: string
    delay: number
    message?: string
    createdTime: number
    dedup?: CommentAutomationDedup
  },
): Promise<CommentReplyOutcome | null> {
  if (privateReply.type === "none") {
    return null
  }

  // Defence in depth: the caller already gates on this (and records the blocked
  // delivery when it does), so reaching here means a new call site skipped the
  // gate. Same predicate either way, so the two can never disagree.
  if (
    isOutsidePrivateReplyWindow({
      channelType: ctx.channelType,
      createdTime: ctx.createdTime,
      delay: ctx.delay,
    })
  ) {
    logger.warn(
      {
        automationId: ctx.automationId,
        commentId: ctx.commentId,
        workspaceId: ctx.workspaceId,
        reason: `comment older than ${privateReplyWindowLabel(ctx.channelType)}`,
      },
      "Comment automation private reply skipped",
    )
    return null
  }

  const sendText = PRIVATE_REPLY_TEXT_SENDERS[ctx.channelType]
  if (!sendText) {
    // Channel has no private-reply API (Threads). Callers log the skip with
    // the automation id; this guard keeps flow/AIAgent dispatch from enqueuing
    // a job whose reply could never be delivered.
    return null
  }

  // A flow cannot run over a conditional channel's DM. TikTok grants exactly
  // one comment-anchored message per comment and its `sendFlowStep` needs a
  // `conversation_id` for every step — which does not exist until the contact
  // replies — so step 2 onwards would fail with `tiktok_missing_conversation_id`
  // after step 1 had already gone out. Belt-and-braces behind the form, which
  // does not offer `flow` on these channels at all.
  if (
    privateReply.type === "flow" &&
    privateReplyRequiresHighIntent(ctx.channelType)
  ) {
    logger.info(
      {
        automationId: ctx.automationId,
        commentId: ctx.commentId,
        channelType: ctx.channelType,
      },
      "Comment automation private reply skipped: flow replies are not deliverable on this channel",
    )
    return null
  }

  if (privateReply.type === "text" && privateReply.value) {
    // Spun before the variable pass, and outside the try/catch, so a reply
    // still varies when contact data fails to load and the raw text ships.
    const spunValue = applySpintax(privateReply.value)
    let text = spunValue
    try {
      const variables = await contactVariableService.getAll({
        contactId: ctx.contactInbox.contactId,
        contactInbox: ctx.contactInbox,
      })
      text = await contactVariableService.replaceAll({
        text: spunValue,
        variables,
      })
    } catch (err) {
      logger.warn(
        { err, commentId: ctx.commentId },
        "Failed to resolve variables in reply text, sending raw text",
      )
    }

    await sendText(ctx.auth, ctx.commentId, text)
    // Delivered from birth rather than settled by a follow-up `markDelivered`:
    // this send leaves no `Message` row for a webhook to match (it goes
    // straight out through the comment_id-anchored Send API), and the caller
    // has not written the analytics row yet — so an UPDATE here would match
    // nothing at all. See `deliveredAt` on `CommentReplyOutcome`.
    return { replyType: "text", replyText: text, deliveredAt: new Date() }
  }

  if (privateReply.type === "flow" && privateReply.value) {
    // The flow's *state* lives on the DM conversation, where the contact's
    // replies arrive; only its first message's *delivery* is anchored to the
    // comment. See resolveDirectMessageConversationId.
    const conversationId = await resolveDirectMessageConversationId(ctx)
    const flowId = privateReply.value

    return {
      replyType: "flow",
      replyText: await describeFlowReply({
        workspaceId: ctx.workspaceId,
        flowId,
      }),
      // Enqueued by the caller once the analytics row exists — see `dispatch`
      // on `CommentReplyOutcome`.
      dispatch: async () => {
        await integrationQueue.add(
          IntegrationJobAction.sendFlow,
          {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId,
              contactInboxId: ctx.contactInboxId,
              flowId,
              origin: webhookChannelOrigin(),
              // Carries the automation to the code that encodes button
              // payloads. The anchor below names it too, but `sendFlowStep`
              // hands each integration the raw step and they re-encode from
              // `metadata` alone — `extractMetadata("commentAutomationId", …)`
              // — so without this every button ships an empty `ca` and the
              // Clicked column can never leave zero.
              metadata: {
                type: COMMENT_AUTOMATION_PAYLOAD_TYPE,
                commentAutomationId: ctx.automationId,
                commentId: ctx.commentId,
                replyChannel: "private" as const,
              },
              // The anchor lets the channel deliver the flow's first message
              // via Meta's comment_id-anchored Send API (7-day comment window)
              // instead of a normal DM gated by the 24-hour messaging window.
              // Supported on all comment-automation channels (messenger,
              // instagram, instagramFacebook).
              commentAnchor: {
                commentId: ctx.commentId,
                replyChannel: "private" as const,
                // Lets the flow runner report this reply's delivery back to
                // the automation — see `settleCommentAutomationDelivered`.
                automationId: ctx.automationId,
              },
            },
          },
          { delay: ctx.delay },
        )
      },
    }
  }

  if (privateReply.type === "AIAgent" && privateReply.value) {
    const agentId = privateReply.value

    return {
      replyType: "AIAgent",
      replyText: null,
      // Deferred for the same reason the flow branch is: `processCommentAIReply`
      // settles its outcome onto the analytics row the caller writes next.
      dispatch: async () => {
        await aiAgentQueue.add(
          AIJobAction.commentAIReply,
          {
            type: AIJobAction.commentAIReply,
            data: {
              automationId: ctx.automationId,
              integrationType: ctx.integrationType,
              integrationIdentifier: ctx.integrationIdentifier,
              workspaceId: ctx.workspaceId,
              conversationId: ctx.conversationId,
              contactInboxId: ctx.contactInboxId,
              commentId: ctx.commentId,
              agentId,
              replyChannel: "private",
              channelType: ctx.channelType,
              message: ctx.message,
              commentDedup: ctx.dedup,
            },
          },
          {
            delay: ctx.delay,
            jobId: `comment-ai-reply-${ctx.automationId}-${ctx.commentId}-private`,
          },
        )
      },
    }
  }

  return null
}
