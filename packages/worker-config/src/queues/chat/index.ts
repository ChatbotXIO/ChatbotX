import type { ConversationEntity, MessageEntity } from "@ahachat.ai/sdk"
import { Queue } from "bullmq"
import { connection, defaultJobOptions } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export enum ChatJobAction {
  SEND_MESSAGE = "SEND_MESSAGE",
  TRIGGER_MESSAGE = "TRIGGER_MESSAGE",
}

export type ChatJobSendMessage = {
  type: ChatJobAction.SEND_MESSAGE
  data: {
    conversation: ConversationEntity
    message: MessageEntity
  }
}

export type ChatJobTriggerMessage = {
  type: ChatJobAction.TRIGGER_MESSAGE
  data: {
    conversationId: string
    content: string
  }
}

export type ChatJobData = ChatJobSendMessage | ChatJobTriggerMessage

export const chatQueue = new Queue<ChatJobData>(QueueName.CHAT, {
  connection,
  defaultJobOptions,
})
