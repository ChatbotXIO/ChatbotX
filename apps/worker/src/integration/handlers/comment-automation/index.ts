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
import {
  type MessengerAuthValue,
  sendPrivateReply,
} from "@chatbotx.io/integration-messenger"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
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
const LINK_RE = /https?:\/\//

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

function matchPost(post: FBCommentPost, postId: string): boolean {
  if (post.type === "all") {
    return true
  }
  if (post.type === "postIds") {
    return post.value.includes(postId)
  }
  return true
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

function willSendReply(reply: FBCommentReply): boolean {
  if (reply.type === "none") {
    return false
  }
  if (reply.type === "AIAgent") {
    return true
  }
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

async function executePublicReply(
  publicReply: FBCommentReply,
  ctx: {
    auth: MessengerAuthValue
    commentId: string
    channelType: "messenger" | "instagram"
    conversationId: string
    contactInboxId: string
    delay: number
    workspaceId: string
    contactInbox: ContactInboxModel
    parentMessageId?: string | null
    parentMessageCreatedAt?: Date | null
  },
) {
  if (publicReply.type === "none") {
    return
  }

  if (publicReply.type === "text" && publicReply.value) {
    const repo = await createMessageRepository()
    const messageInput = {
      conversationId: ctx.conversationId,
      contactInboxId: ctx.contactInboxId,
      workspaceId: ctx.workspaceId,
      messageType: "outgoing" as const,
      contentType: "text" as const,
      senderType: "bot" as const,
      text: publicReply.value,
      type: "comment" as const,
      contentAttributes: { replyToCommentId: ctx.commentId },
      parentId: ctx.parentMessageId ?? null,
      createdAt: new Date(),
    }
    const message = await repo.create(messageInput)
    broadcastToWorkspaceParty(ctx.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: message,
    }).catch((err: unknown) =>
      logger.error(
        { err, commentId: ctx.commentId },
        "Unable to emit realtime message",
      ),
    )
    await chatQueue.add(
      ChatJobAction.sendChannelMessage,
      {
        type: ChatJobAction.sendChannelMessage,
        data: {
          conversation: {
            id: ctx.conversationId,
            workspaceId: ctx.workspaceId,
          } as ConversationModel,
          contactInbox: ctx.contactInbox,
          message: {
            ...message,
            parentCreatedAt: ctx.parentMessageCreatedAt ?? null,
          },
        },
      },
      { delay: ctx.delay },
    )
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
        },
      },
      { delay: ctx.delay },
    )
    return
  }

  if (publicReply.type === "AIAgent") {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
        },
      },
      { delay: ctx.delay },
    )
  }
}

async function executePrivateReply(
  privateReply: FBCommentReply,
  ctx: {
    auth: MessengerAuthValue
    commentId: string
    channelType: "messenger" | "instagram"
    conversationId: string
    contactInboxId: string
    delay: number
  },
) {
  if (privateReply.type === "none") {
    return
  }

  if (privateReply.type === "text" && privateReply.value) {
    if (ctx.channelType === "messenger") {
      await sendPrivateReply(ctx.auth, ctx.commentId, privateReply.value).catch(
        (_e) => undefined,
      )
    }
    // Instagram private DM text reply: out of scope MVP (no private_replies API)
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
        },
      },
      { delay: ctx.delay },
    )
    return
  }

  if (privateReply.type === "AIAgent") {
    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: ctx.conversationId,
          contactInboxId: ctx.contactInboxId,
        },
      },
      { delay: ctx.delay },
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

  const shouldHide =
    hideComments.all ||
    (hideComments.hasPhoneNumber && PHONE_RE.test(text)) ||
    (hideComments.hasLink && LINK_RE.test(text)) ||
    (hideComments.hasKeywords &&
      hideComments.keywords.some((k) => text.includes(k))) ||
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
    return
  }

  const channelType = integrationType as "messenger" | "instagram"
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
        continue
      }
      if (!matchPost(automation.post, postId)) {
        continue
      }
      if (automation.options.ignoreCommentReplies && parentId) {
        continue
      }
      if (
        !matchKeywords(
          automation.includeKeywords,
          automation.excludeKeywords,
          message,
        )
      ) {
        continue
      }

      if (automation.options.replyToNewContactsOnly) {
        const priorCount =
          await fbCommentAutomationService.getPriorContactInboxCount({
            contactId: contactInbox.contactId,
          })
        if (priorCount > 1) {
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
          continue
        }
      }

      await fbCommentAutomationService.insertDedup({
        automationId: automation.id,
        contactId: contactInbox.contactId,
        postId,
        workspaceId,
      })

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

      executePublicReply(automation.publicReply, {
        auth,
        commentId,
        channelType,
        conversationId,
        contactInboxId,
        delay,
        workspaceId,
        contactInbox,
        parentMessageId,
        parentMessageCreatedAt,
      }).catch((err) =>
        logger.error(
          { err, automationId: automation.id, commentId },
          "Failed to send public reply",
        ),
      )

      executePrivateReply(automation.privateReply, {
        auth,
        commentId,
        channelType,
        conversationId,
        contactInboxId,
        delay,
      }).catch((err) =>
        logger.error(
          { err, automationId: automation.id, commentId },
          "Failed to send private reply",
        ),
      )

      if (
        willSendReply(automation.publicReply) ||
        willSendReply(automation.privateReply)
      ) {
        await fbCommentAutomationService.incrementRepliesCount(automation.id)
      }
    } catch (err) {
      logger.error(
        { err, automationId: automation.id, commentId, workspaceId },
        "Failed to process comment automation",
      )
    }
  }
}
