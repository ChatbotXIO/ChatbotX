import {
  broadcastToWorkspaceParty,
  contactInboxService,
  fbCommentAutomationService,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  FBCommentHideComments,
  FBCommentIncludeKeywords,
  FBCommentPost,
  FBCommentReply,
  FBCommentReplyAfter,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
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
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  type IntegrationJobProcessCommentAutomation,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import {
  createAttachmentInfoResolver,
  needsAttachmentInfo,
} from "./comment-attachment"

const RANDOM_DELAY_MINUTES: Record<string, number> = {
  randomWithin3Minutes: 3,
  randomWithin5Minutes: 5,
  randomWithin10Minutes: 10,
  randomWithin20Minutes: 20,
  randomWithin30Minutes: 30,
  randomWithin60Minutes: 60,
}

const PHONE_RE = /\+?\d[\d\s\-().]{7,}/
// `http(s)://`/`www.` links match case-insensitively — the scheme itself is
// never meaningfully cased. Bare domains without a scheme (e.g. "example.com",
// common since Facebook comments frequently omit `http(s)://`) are matched
// case-SENSITIVELY on purpose: real domains are written lowercase, while a
// missing space after a sentence-ending period produces a capitalized
// continuation word (e.g. "ban.Shop", "ngay.Info") that would otherwise be
// misdetected as a link. `co` is deliberately excluded from the bare list —
// it's too common as a standalone lowercase word/abbreviation (e.g.
// "picture.co founder") to distinguish from a real ".co" domain; a bare `.co`
// link still needs `www.`/`http(s)://` to be caught.
const SCHEME_LINK_RE = /https?:\/\/|www\./i
const BARE_DOMAIN_RE =
  /\b[a-z0-9-]+\.(?:com|net|org|io|vn|shop|store|info|biz)\b/

function hasLink(text: string): boolean {
  return SCHEME_LINK_RE.test(text) || BARE_DOMAIN_RE.test(text)
}

const UNHIDE_DELAY_MS: Record<string, number> = {
  "6h": 6 * 3_600_000,
  "12h": 12 * 3_600_000,
  "1d": 86_400_000,
  "2d": 2 * 86_400_000,
  "3d": 3 * 86_400_000,
  "4d": 4 * 86_400_000,
  "5d": 5 * 86_400_000,
  "6d": 6 * 86_400_000,
  "7d": 7 * 86_400_000,
  "8d": 8 * 86_400_000,
  "9d": 9 * 86_400_000,
  "10d": 10 * 86_400_000,
}

// Facebook post ids are composite `{pageId}_{storyId}`. The published/ads
// pickers store that composite form, but the reels picker stores a bare id and
// users pasting an id manually often omit the `{pageId}_` prefix. Compare on the
// trailing story id (unique) so all three formats match the webhook `post_id`.
function normalizePostId(id: string): string {
  const idx = id.indexOf("_")
  return idx === -1 ? id : id.slice(idx + 1)
}

function matchPost(post: FBCommentPost, postId: string): boolean {
  if (post.type !== "postIds") {
    return true
  }
  const target = normalizePostId(postId)
  return post.value.some((v) => v === postId || normalizePostId(v) === target)
}

function matchKeywords(
  includeKeywords: FBCommentIncludeKeywords,
  excludeKeywords: string[],
  message: string | undefined,
): boolean {
  const text = (message ?? "").toLowerCase()
  if (includeKeywords.type !== "all" && includeKeywords.value.length > 0) {
    const kws = includeKeywords.value.map((k) => k.toLowerCase())
    if (includeKeywords.type === "equal" && !kws.includes(text)) {
      return false
    }
    if (
      includeKeywords.type === "contain" &&
      !kws.some((k) => text.includes(k))
    ) {
      return false
    }
  }
  if (excludeKeywords.some((k) => text.includes(k.toLowerCase()))) {
    return false
  }
  return true
}

// Facebook feed webhooks set parent_id on every comment: for a top-level
// comment it equals the post id, and only a reply to another comment carries
// that comment's id instead.
export function isCommentReply(
  parentId: string | undefined,
  postId: string,
): boolean {
  return Boolean(parentId) && parentId !== postId
}

function willSendReply(reply: FBCommentReply): boolean {
  if (reply.type === "none") {
    return false
  }
  // text/flow need a value; AIAgent needs the selected agent id in `value`.
  return Boolean(reply.value)
}

function computeDelayMs(replyAfter: FBCommentReplyAfter): number {
  if (replyAfter.type === "immediately") {
    return 0
  }
  if (replyAfter.type === "seconds") {
    return replyAfter.value * 1000
  }
  if (replyAfter.type === "minutes") {
    return replyAfter.value * 60_000
  }
  if (replyAfter.type === "hours") {
    return replyAfter.value * 3_600_000
  }
  const minutes =
    RANDOM_DELAY_MINUTES[replyAfter.type as keyof typeof RANDOM_DELAY_MINUTES]
  return Math.floor(Math.random() * (minutes ?? 3) * 60_000)
}

/**
 * Post a public Facebook comment reply: creates the outgoing DB message,
 * broadcasts it over realtime, and enqueues the actual send. Shared by the
 * `text` reply type (dispatched immediately, sends after `delay`) and
 * `processCommentAIReply` (already runs inside a job delayed by the caller, so
 * no further `delay` applies).
 */
export async function postPublicCommentReply(props: {
  text: string
  commentId: string
  conversationId: string
  contactInboxId: string
  workspaceId: string
  contactInbox: ContactInboxModel
  parentMessageId?: string | null
  parentMessageCreatedAt?: Date | null
  delay?: number
}): Promise<void> {
  const repo = await createMessageRepository()
  const messageInput = {
    conversationId: props.conversationId,
    contactInboxId: props.contactInboxId,
    workspaceId: props.workspaceId,
    messageType: "outgoing" as const,
    contentType: "text" as const,
    senderType: "bot" as const,
    text: props.text,
    type: "comment" as const,
    contentAttributes: { replyToCommentId: props.commentId },
    parentId: props.parentMessageId ?? null,
    createdAt: new Date(),
  }
  const message = await repo.create(messageInput)
  broadcastToWorkspaceParty(props.workspaceId, {
    eventType: RealtimeEventType.messageCreated,
    data: message,
  }).catch((err: unknown) =>
    logger.error(
      { err, commentId: props.commentId },
      "Unable to emit realtime message",
    ),
  )
  await chatQueue.add(
    ChatJobAction.sendChannelMessage,
    {
      type: ChatJobAction.sendChannelMessage,
      data: {
        conversation: {
          id: props.conversationId,
          workspaceId: props.workspaceId,
        } as ConversationModel,
        contactInbox: props.contactInbox,
        message: {
          ...message,
          parentCreatedAt: props.parentMessageCreatedAt ?? null,
        },
      },
    },
    ...(props.delay === undefined ? [] : [{ delay: props.delay }]),
  )
}

async function executePublicReply(
  publicReply: FBCommentReply,
  ctx: {
    auth: MessengerAuthValue
    integrationType: string
    integrationIdentifier: string
    commentId: string
    channelType: "messenger" | "instagram" | "instagramFacebook"
    conversationId: string
    contactInboxId: string
    delay: number
    workspaceId: string
    contactInbox: ContactInboxModel
    message?: string
    parentMessageId?: string | null
    parentMessageCreatedAt?: Date | null
  },
) {
  if (publicReply.type === "none") {
    return
  }

  if (publicReply.type === "text" && publicReply.value) {
    let text = publicReply.value
    try {
      const variables = await contactVariableService.getAll({
        contactId: ctx.contactInbox.contactId,
        contactInbox: ctx.contactInbox,
      })
      text = await contactVariableService.replaceAll({
        text: publicReply.value,
        variables,
      })
    } catch (err) {
      logger.warn(
        { err, commentId: ctx.commentId },
        "Failed to resolve variables in reply text, sending raw text",
      )
    }
    await postPublicCommentReply({
      text,
      commentId: ctx.commentId,
      conversationId: ctx.conversationId,
      contactInboxId: ctx.contactInboxId,
      workspaceId: ctx.workspaceId,
      contactInbox: ctx.contactInbox,
      parentMessageId: ctx.parentMessageId,
      parentMessageCreatedAt: ctx.parentMessageCreatedAt,
      delay: ctx.delay,
    })
    return
  }

  if (publicReply.type === "flow" && publicReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          flowId: publicReply.value,
          origin: webhookChannelOrigin(),
          commentAnchor: { commentId: ctx.commentId, replyChannel: "public" },
        },
      },
      { delay: ctx.delay },
    )
    return
  }

  if (publicReply.type === "AIAgent" && publicReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.commentAIReply,
      {
        type: IntegrationJobAction.commentAIReply,
        data: {
          integrationType: ctx.integrationType,
          integrationIdentifier: ctx.integrationIdentifier,
          workspaceId: ctx.workspaceId,
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          commentId: ctx.commentId,
          agentId: publicReply.value,
          replyChannel: "public",
          channelType: ctx.channelType,
          message: ctx.message,
          parentMessageId: ctx.parentMessageId ?? null,
          parentMessageCreatedAt:
            ctx.parentMessageCreatedAt?.toISOString() ?? null,
        },
      },
      { delay: ctx.delay },
    )
  }
}

async function executePrivateReply(
  privateReply: FBCommentReply,
  ctx: {
    auth: MessengerAuthValue | InstagramAuthValue | InstagramFacebookAuthValue
    integrationType: string
    integrationIdentifier: string
    commentId: string
    channelType: "messenger" | "instagram" | "instagramFacebook"
    conversationId: string
    contactInboxId: string
    contactInbox: ContactInboxModel
    workspaceId: string
    delay: number
    message?: string
  },
) {
  if (privateReply.type === "none") {
    return
  }

  if (privateReply.type === "text" && privateReply.value) {
    let text = privateReply.value
    try {
      const variables = await contactVariableService.getAll({
        contactId: ctx.contactInbox.contactId,
        contactInbox: ctx.contactInbox,
      })
      text = await contactVariableService.replaceAll({
        text: privateReply.value,
        variables,
      })
    } catch (err) {
      logger.warn(
        { err, commentId: ctx.commentId },
        "Failed to resolve variables in reply text, sending raw text",
      )
    }

    if (ctx.channelType === "messenger") {
      await sendPrivateReply(
        ctx.auth as MessengerAuthValue,
        ctx.commentId,
        text,
      )
    } else if (ctx.channelType === "instagram") {
      // Instagram Login sends the private DM through the me/messages endpoint,
      // addressing the commenter by comment id.
      await sendInstagramLoginPrivateReply(
        ctx.auth as InstagramAuthValue,
        ctx.commentId,
        text,
      )
    } else if (ctx.channelType === "instagramFacebook") {
      // Instagram via Facebook Login sends the private DM through the
      // {igId}/messages endpoint (Page/Business-asset token), addressing the
      // commenter by comment id.
      await sendInstagramFacebookPrivateReply(
        ctx.auth as InstagramFacebookAuthValue,
        ctx.commentId,
        text,
      )
    }
    return
  }

  if (privateReply.type === "flow" && privateReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          flowId: privateReply.value,
          origin: webhookChannelOrigin(),
          ...(ctx.channelType === "messenger"
            ? {
                commentAnchor: {
                  commentId: ctx.commentId,
                  replyChannel: "private" as const,
                },
              }
            : {}),
        },
      },
      { delay: ctx.delay },
    )
    return
  }

  if (privateReply.type === "AIAgent" && privateReply.value) {
    await integrationQueue.add(
      IntegrationJobAction.commentAIReply,
      {
        type: IntegrationJobAction.commentAIReply,
        data: {
          integrationType: ctx.integrationType,
          integrationIdentifier: ctx.integrationIdentifier,
          workspaceId: ctx.workspaceId,
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
          commentId: ctx.commentId,
          agentId: privateReply.value,
          replyChannel: "private",
          channelType: ctx.channelType,
          message: ctx.message,
        },
      },
      {
        delay: ctx.delay,
      },
    )
  }
}

async function applyHideComments(
  hideComments: FBCommentHideComments,
  commentId: string,
  message: string | undefined,
  ctx: {
    conversation: ConversationModel
    contactInbox: ContactInboxModel
    messageId: string
    messageCreatedAt: Date
    hasImage: boolean
    hasVideo: boolean
  },
) {
  const text = message ?? ""
  const lowerText = text.toLowerCase()

  const shouldHide =
    hideComments.all ||
    (hideComments.hasPhoneNumber && PHONE_RE.test(text)) ||
    (hideComments.hasLink && hasLink(text)) ||
    (hideComments.hasKeywords &&
      hideComments.keywords.some((k) => lowerText.includes(k.toLowerCase()))) ||
    (hideComments.hasImage && ctx.hasImage) ||
    (hideComments.hasVideo && ctx.hasVideo)

  if (!shouldHide) {
    return
  }

  await chatQueue.add(ChatJobAction.changeChannelMessageState, {
    type: ChatJobAction.changeChannelMessageState,
    data: {
      conversation: ctx.conversation,
      contactInbox: ctx.contactInbox,
      message: { id: ctx.messageId, createdAt: ctx.messageCreatedAt },
      hidden: true,
    },
  })

  if (hideComments.showCommentsAfter !== "none") {
    const delay = UNHIDE_DELAY_MS[hideComments.showCommentsAfter] ?? 0
    await chatQueue.add(
      ChatJobAction.changeChannelMessageState,
      {
        type: ChatJobAction.changeChannelMessageState,
        data: {
          conversation: ctx.conversation,
          contactInbox: ctx.contactInbox,
          message: { id: ctx.messageId, createdAt: ctx.messageCreatedAt },
          hidden: false,
        },
      },
      { delay, jobId: `unhide-comment-${commentId}` },
    )
  }
}

export async function processCommentAutomation(
  data: IntegrationJobProcessCommentAutomation["data"],
): Promise<void> {
  const {
    integrationType,
    integrationIdentifier,
    workspaceId,
    conversationId,
    contactInboxId,
    commentId,
    postId,
    parentId,
    fromId: _fromId,
    message,
    createdTime,
  } = data

  const { integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const auth = integrationRow.auth as MessengerAuthValue

  const contactInbox = await contactInboxService.findBy({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    logger.warn(
      { contactInboxId, workspaceId, commentId },
      "Comment automation skipped: contactInbox not found",
    )
    return
  }

  const channelType = integrationType as
    | "messenger"
    | "instagram"
    | "instagramFacebook"
  const automations = await fbCommentAutomationService.findActiveAutomations({
    workspaceId,
    channelType,
  })

  const workspace = await workspaceService.findById({ id: workspaceId })

  const resolveAttachmentInfo = createAttachmentInfoResolver({
    channelType,
    workspaceId,
    commentId,
    integrationRow,
    auth,
  })

  for (const automation of automations) {
    try {
      if (
        !fbCommentAutomationService.isWithinSchedule(
          automation,
          workspace.timezone,
        )
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "outside schedule",
        })
        continue
      }
      if (!matchPost(automation.post, postId)) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "post does not match",
        })
        continue
      }
      if (
        automation.options.ignoreCommentReplies &&
        isCommentReply(parentId, postId)
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "comment is a reply",
        })
        continue
      }
      if (
        !matchKeywords(
          automation.includeKeywords,
          automation.excludeKeywords,
          message,
        )
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          commentId,
          postId,
          workspaceId,
          reason: "keywords do not match",
        })
        continue
      }

      if (automation.options.replyToNewContactsOnly) {
        const priorCount =
          await fbCommentAutomationService.getPriorContactInboxCount({
            contactId: contactInbox.contactId,
          })
        if (priorCount > 1) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: "contact is not new",
          })
          continue
        }
      }

      if (automation.options.replyOncePerUserPerPost) {
        const existing = await fbCommentAutomationService.findDedup({
          automationId: automation.id,
          contactId: contactInbox.contactId,
          postId,
        })
        if (existing) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: "already replied to this user on this post",
          })
          continue
        }
      }

      if (!automation.options.replyToUsersWhoCommentedOnOtherPosts) {
        const repliedElsewhere =
          await fbCommentAutomationService.hasRepliedOnOtherPost({
            automationId: automation.id,
            contactId: contactInbox.contactId,
            postId,
          })
        if (repliedElsewhere) {
          logAutomationSkipped({
            automationId: automation.id,
            commentId,
            postId,
            workspaceId,
            reason: "user already engaged on another post",
          })
          continue
        }
      }

      const delay = computeDelayMs(automation.replyAfter)

      const messageRepo = await createMessageRepository()
      const dbMessage = await messageRepo.findBySourceId(
        commentId,
        conversationId,
        workspaceId,
        new Date(createdTime * 1000),
      )

      let parentMessageId: string | null = null
      let parentMessageCreatedAt: Date | null = null

      if (dbMessage) {
        parentMessageId = dbMessage.id
        parentMessageCreatedAt = dbMessage.createdAt
        const conversationRef = {
          id: conversationId,
          workspaceId,
        } as ConversationModel
        const messageRef = { id: dbMessage.id, createdAt: dbMessage.createdAt }

        if (automation.options.likeUserComment) {
          chatQueue
            .add(ChatJobAction.changeChannelMessageState, {
              type: ChatJobAction.changeChannelMessageState,
              data: {
                conversation: conversationRef,
                contactInbox,
                message: messageRef,
                liked: true,
              },
            })
            .catch((err: unknown) =>
              logger.error(
                { err, automationId: automation.id, commentId },
                "Failed to like comment",
              ),
            )
        }

        const { hasImage, hasVideo } = needsAttachmentInfo(
          automation.hideComments,
        )
          ? await resolveAttachmentInfo()
          : { hasImage: false, hasVideo: false }

        applyHideComments(automation.hideComments, commentId, message, {
          conversation: conversationRef,
          contactInbox,
          messageId: dbMessage.id,
          messageCreatedAt: dbMessage.createdAt,
          hasImage,
          hasVideo,
        }).catch((err: unknown) =>
          logger.error(
            { err, automationId: automation.id, commentId },
            "Failed to apply hide comments",
          ),
        )
      }

      let dispatchFailed = false

      try {
        await executePublicReply(automation.publicReply, {
          auth,
          integrationType,
          integrationIdentifier,
          commentId,
          channelType,
          conversationId,
          contactInboxId,
          delay,
          workspaceId,
          contactInbox,
          message,
          parentMessageId,
          parentMessageCreatedAt,
        })
      } catch (err) {
        logger.error(
          { err, automationId: automation.id, commentId },
          "Failed to send public reply",
        )
        if (willSendReply(automation.publicReply)) {
          dispatchFailed = true
        }
      }

      try {
        await executePrivateReply(automation.privateReply, {
          auth,
          integrationType,
          integrationIdentifier,
          commentId,
          channelType,
          conversationId,
          contactInboxId,
          contactInbox,
          workspaceId,
          delay,
          message,
        })
      } catch (err) {
        logger.error(
          { err, automationId: automation.id, commentId },
          "Failed to send private reply",
        )
        if (willSendReply(automation.privateReply)) {
          dispatchFailed = true
        }
      }

      // Dedup/count fire once dispatch is *enqueued*, not once an async reply
      // (flow, AIAgent) actually succeeds — a later failure inside that job
      // (e.g. agent misconfigured, no auto-reply-enabled provider) still
      // counts as "replied" here and won't be retried. Fixing this properly
      // requires threading the dedup write into the async job itself for
      // every async-dispatch reply type, which is out of scope for now.
      if (!dispatchFailed) {
        await fbCommentAutomationService.insertDedup({
          automationId: automation.id,
          contactId: contactInbox.contactId,
          postId,
          workspaceId,
        })

        if (
          willSendReply(automation.publicReply) ||
          willSendReply(automation.privateReply)
        ) {
          await fbCommentAutomationService.incrementRepliesCount(automation.id)
        }
      }
    } catch (err) {
      logger.error(
        { err, automationId: automation.id, commentId, workspaceId },
        "Failed to process comment automation",
      )
    }
  }
}

const logAutomationSkipped = ({
  automationId,
  commentId,
  postId,
  workspaceId,
  reason,
}: {
  automationId: string
  commentId: string
  postId: string
  workspaceId: string
  reason: string
}) => {
  logger.info(
    { automationId, commentId, postId, workspaceId, reason },
    "Comment automation skipped",
  )
}
