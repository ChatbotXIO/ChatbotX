import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  ConversationModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { simpleQueue } from "@chatbotx.io/redis"
import { getKey } from "./constants"
import { dispatchAutomatedResponseReply } from "./dispatch-reply"
import { logger } from "./lib/logger"
import { automatedResponseService } from "./utils"

export const processPendingMessages = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}): Promise<boolean> => {
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
}): Promise<boolean> => {
  const key = getKey({
    conversationId: props.conversation.id,
    contactInboxId: props.contactInbox.id,
  })

  const messageIds = await simpleQueue.getAll(key)
  if (messageIds.length === 0) {
    logger.debug(props, "Automated response queue is empty")
    return false
  }

  // Only process text messages
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
    .then((data) => data.filter((v) => Boolean(v.text)))
  if (messages.length === 0) {
    logger.debug(props, "No message to process")
    return false
  }

  return replyByAutomatedResponse({
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    messages,
  })
}

const replyByAutomatedResponse = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  messages: Pick<MessageModel, "id" | "text">[]
}): Promise<boolean> => {
  const { conversation, contactInbox, messages } = props
  const allAutomatedResponses = await automatedResponseService.getAll(
    conversation.workspaceId,
  )
  const inboundAutomatedResponses = allAutomatedResponses.filter(
    (automatedResponse) => automatedResponse.type === "inbound",
  )

  for (const message of messages) {
    if (!message.text) {
      continue
    }
    const replied = await dispatchAutomatedResponseReply({
      conversation,
      contactInbox,
      messageId: message.id,
      text: message.text,
      rules: inboundAutomatedResponses,
      triggerType: "contact_message_in",
    })
    if (replied) {
      return true
    }
  }

  return false
}
