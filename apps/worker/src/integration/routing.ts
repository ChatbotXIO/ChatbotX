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
  // A pending challenge (e.g. Get User Data) accepts any actionable reply —
  // text, an uploaded attachment, or a shared location.
  hasActionableInput: boolean
  // Automated (AI) responses stay text-driven only.
  hasText: boolean
  isConversationActive: (conversation: ConversationModel) => Promise<boolean>
}): Promise<IncomingRoutingDecision> {
  if (!props.hasActionableInput) {
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

  if (!props.hasText) {
    return { type: "none" }
  }

  return { type: "automatedResponse", conversation }
}
