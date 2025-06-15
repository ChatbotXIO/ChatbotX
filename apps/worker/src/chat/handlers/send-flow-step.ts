import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
} from "@ahachat.ai/database"
import { StepType } from "@ahachat.ai/flow-config"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@ahachat.ai/party-config"
import type { ConversationEntity } from "@ahachat.ai/sdk"
import type { ChatJobSendFlowStep } from "@ahachat.ai/worker-config"
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
  if (!conversation) return

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
