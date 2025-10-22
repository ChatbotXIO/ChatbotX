import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
} from "@aha.chat/database"
import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
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
      messageType: MessageType.outgoing,
      contentType: ContentType.text,
      senderType: SenderType.bot,
      sourceId: null,
      content: step.stepType === StepType.sendText ? step.message : null,
    },
  })

  const promises: Promise<unknown>[] = [
    broadcastToChatbotParty(conversation.chatbotId, {
      eventType: RealtimeEventType.CREATE_MESSAGE,
      data: message,
    }),
  ]
  if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
    promises.push(
      broadcastToGuestParty(conversation.sourceId, {
        eventType: RealtimeEventType.CREATE_MESSAGE,
        data: message,
      }),
    )
  } else {
    promises.push(
      sendFlowStepToExternal({
        conversation: conversation as ConversationEntity,
        flowVersionId,
        step,
      }),
    )
  }

  await Promise.all(promises)
}
