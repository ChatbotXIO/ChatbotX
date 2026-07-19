import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import type { ConversationModel } from "@chatbotx.io/database/types"

type IncomingRoutingDecision =
  | { type: "none" }
  | {
      type: "challenge"
      conversation: ConversationModel
      challenge: NonNullable<ConversationAttributes["challenge"]>
    }
  | { type: "automatedResponse"; conversation: ConversationModel }

export async function resolveIncomingTextRouting(props: {
  conversation: ConversationModel
  isEligibleIncomingText: boolean
  isConversationActive: (conversation: ConversationModel) => Promise<boolean>
}): Promise<IncomingRoutingDecision> {
  if (!props.isEligibleIncomingText) {
    return { type: "none" }
  }

  const conversation = props.conversation
  if (!(await props.isConversationActive(conversation))) {
    return { type: "none" }
  }

  const challenge = (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge
  if (challenge) {
    return { type: "challenge", conversation, challenge }
  }

  return { type: "automatedResponse", conversation }
}
