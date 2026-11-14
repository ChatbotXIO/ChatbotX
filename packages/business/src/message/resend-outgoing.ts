import {
  isResendableMessage,
  REPLY_TARGET_CREATED_AT_KEY,
} from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { MessageModel } from "@chatbotx.io/database/types"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { conflictException, notFoundException } from "../errors"
import { logger } from "../logger"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"

const NOT_RESENDABLE_CODE = "messageNotResendable"

const readReplyTargetCreatedAt = (
  contentAttributes: MessageModel["contentAttributes"],
): Date | null => {
  const value = contentAttributes?.[REPLY_TARGET_CREATED_AT_KEY]
  if (typeof value !== "string") {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Re-queues a failed outgoing message for delivery, whole (no record is kept of
 * which part reached the customer). Safe against a double click: the failed
 * state is claimed by one conditional UPDATE, so only the winner enqueues.
 */
export const resendOutgoing = async (props: {
  workspaceId: string
  conversationId: string
  messageId: string
  createdAt: Date
}): Promise<{ id: string; queued: true }> => {
  const { workspaceId, conversationId, messageId, createdAt } = props
  const repository = await createMessageRepository()

  const message = await repository.findById({
    id: messageId,
    createdAt,
    workspaceId,
    conversationId,
  })
  if (!message) {
    throw notFoundException("Message not found")
  }
  if (!isResendableMessage(message)) {
    throw conflictException(
      "This message cannot be resent",
      NOT_RESENDABLE_CODE,
    )
  }

  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId },
  })
  const contactInbox = message.contactInboxId
    ? await contactInboxService.findByIdForWorkspace({
        id: message.contactInboxId,
        workspaceId,
      })
    : null
  if (!contactInbox) {
    throw notFoundException("Contact inbox not found")
  }

  // Everything that can throw is done before the claim, so a failure here
  // never leaves the message claimed (no error, no job) with no way back.
  // The worker finds the comment a private reply answers by its id and
  // createdAt; `createOutgoing` kept the createdAt on the row.
  let parentCreatedAt: Date | null = null
  if (message.parentId) {
    parentCreatedAt = readReplyTargetCreatedAt(message.contentAttributes)
    if (!parentCreatedAt) {
      throw conflictException(
        "The comment this message replies to is no longer available",
        NOT_RESENDABLE_CODE,
      )
    }
  }

  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  const messageWithAttachments = {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: getPublicFileUrl(attachment.originPath, storageUrl),
    })),
  }

  const claimed = await repository.claimForResend({
    id: message.id,
    workspaceId,
    createdAt: message.createdAt,
  })
  if (!claimed) {
    throw conflictException(
      "This message is already being resent",
      NOT_RESENDABLE_CODE,
    )
  }

  try {
    await chatQueue.add(ChatJobAction.sendChannelMessage, {
      type: ChatJobAction.sendChannelMessage,
      data: {
        conversation,
        contactInbox,
        message: { ...messageWithAttachments, parentCreatedAt },
        sendFrom: "inbox",
      },
    })
  } catch (error) {
    // Put the failed state back so the message can be tried again.
    await repository
      .updateSendError(
        message.id,
        message.sendError,
        workspaceId,
        message.createdAt,
      )
      .catch((restoreError: unknown) => {
        logger.error(
          { err: restoreError, messageId: message.id, workspaceId },
          "Failed to restore sendError after a resend enqueue failure",
        )
      })
    throw error
  }

  return { id: message.id, queued: true }
}
