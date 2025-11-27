import type { ConversationModel } from "@aha.chat/database/types"
import type { SendTextStepSchema } from "@aha.chat/flow-config"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"

export type FlowStepProps<T> = {
  conversation: ConversationModel
  flowVersionId: string
  step: T
}

export async function dispatchFlowStep({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<SendTextStepSchema>) {
  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId: conversation.id,
      flowVersionId,
      step,
    },
  })
}
