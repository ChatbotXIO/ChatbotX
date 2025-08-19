import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
} from "@aha.chat/database"
import { StepType } from "@aha.chat/flow-config"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { ConversationEntity } from "@aha.chat/sdk"
import type { ChatJobSendFlowStep } from "@aha.chat/worker-config"
import { sendFlowStepToExternal } from "./send-message"

export async function sendFlowStep({
  conversationId,
  flowVersionId,
  step,
}: ChatJobSendFlowStep["data"]) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
    include: { contact: true },
  })
  if (!conversation) {
    return
  }

  const message = await prisma.message.create({
    data: {
      inboxId: conversation.inboxId,
      chatbotId: conversation.chatbotId,
      conversationId: conversation.id,
      messageType: MessageType.OUTGOING,
      contentType: ContentType.TEXT,
      senderType: SenderType.BOT,
      sourceId: null,
      content: step.stepType === StepType.SEND_TEXT ? step.message : null,
    },
  })

  await Promise.all([
    broadcastToChatbotParty(conversation.chatbotId, {
      eventType: RealtimeEventType.CREATE_MESSAGE,
      data: message,
    }),
    sendFlowStepToExternal({
      conversation: conversation as ConversationEntity,
      flowVersionId,
      step,
    }),
  ])
}
