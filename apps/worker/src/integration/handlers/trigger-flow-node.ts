import type { ConversationEntity } from "@ahachat.ai/sdk"

export type TriggerFlowProps = {
  flowId: string
  nodeId?: string
  conversation: ConversationEntity
}

export const triggerFlowNode = async (props: TriggerFlowProps) => {
  console.log("triggerFlowNode", props)
}
