import {
  createMessageRepository,
  getSafeSinceTime,
  type MessageTextWithFileTypes,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { simpleQueue } from "@chatbotx.io/redis"
import { getKey } from "./constants"
import { dispatchAutomatedResponseReply } from "./dispatch-reply"
import { isKeywordMediaFileType } from "./keyword-match"
import { logger } from "./lib/logger"
import { automatedResponseService } from "./utils"

export type AutomatedResponseProcessResult =
  | { status: "handled" }
  | { status: "noEligibleMessage" }
  | { status: "noMatch" }

export const processPendingMessages = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}): Promise<AutomatedResponseProcessResult> => {
  const result = await getMessagesFromStoreAndProcess(props)

  // Clear the queue after processing
  await simpleQueue.clear(
    getKey({
      conversationId: props.conversation.id,
      contactInboxId: props.contactInbox.id,
    }),
  )

  return result
}

const getMessagesFromStoreAndProcess = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}): Promise<AutomatedResponseProcessResult> => {
  const key = getKey({
    conversationId: props.conversation.id,
    contactInboxId: props.contactInbox.id,
  })

  const messageIds = await simpleQueue.getAll(key)
  if (messageIds.length === 0) {
    logger.debug(props, "Automated response queue is empty")
    return { status: "noEligibleMessage" }
  }

  // Text messages, plus image/video-only messages for the attachment
  // keyword conditions.
  const messageRepository = await createMessageRepository()
  const messages = await messageRepository
    .findManyByIds(
      messageIds,
      props.contactInbox.id,
      getSafeSinceTime(
        props.contactInbox.lastMessageAt,
        365 * 24 * 60 * 60 * 1000, // 1 year
      ),
      props.conversation.workspaceId,
    )
    .then((data) => data.filter(isKeywordEligibleMessage))
  if (messages.length === 0) {
    logger.debug(props, "No message to process")
    return { status: "noEligibleMessage" }
  }

  return replyByAutomatedResponse({
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    messages,
  })
}

const isKeywordEligibleMessage = (message: MessageTextWithFileTypes) =>
  Boolean(message.text) ||
  message.attachmentFileTypes.some(isKeywordMediaFileType)

const replyByAutomatedResponse = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  messages: MessageTextWithFileTypes[]
}): Promise<AutomatedResponseProcessResult> => {
  const { conversation, contactInbox, messages } = props
  const allAutomatedResponses = await automatedResponseService.getAll(
    conversation.workspaceId,
  )
  const inboundAutomatedResponses = allAutomatedResponses.filter(
    (automatedResponse) => automatedResponse.type === "inbound",
  )

  for (const message of messages) {
    const replied = await dispatchAutomatedResponseReply({
      conversation,
      contactInbox,
      messageId: message.id,
      text: message.text ?? "",
      attachmentFileTypes: message.attachmentFileTypes,
      rules: inboundAutomatedResponses,
      triggerType: "contact_message_in",
      startedByContactMessage: true,
    })
    if (replied) {
      return { status: "handled" }
    }
  }

  return { status: "noMatch" }
}
