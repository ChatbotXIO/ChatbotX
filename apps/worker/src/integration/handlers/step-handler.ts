import type { ConversationModel } from "@ahachat.ai/database/types"
import type { SendTextStepSchema } from "@ahachat.ai/flow-config"
import { ChatJobAction, chatQueue } from "@ahachat.ai/worker-config"

export interface FlowStepProps<T> {
  conversation: ConversationModel
  flowVersionId: string
  step: T
}

export async function dispatchFlowStep({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<SendTextStepSchema>) {
  await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
    type: ChatJobAction.SEND_FLOW_STEP,
    data: {
      conversationId: conversation.id,
      flowVersionId,
      step,
    },
  })
}
