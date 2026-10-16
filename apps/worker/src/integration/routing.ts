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
  | { type: "handoffReentry"; conversation: ConversationModel }

function getPendingChallenge(conversation: ConversationModel) {
  return (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge
}

// A story mention is answered by its own automations only when nothing else
// owns the reply: a pending challenge (e.g. Get User Data waiting for a photo)
// must still receive the mention's media, and a paused bot (a human owns the
// thread) must stay silent. In both cases the mention takes the normal route.
export async function shouldRunStoryMentionAutomation(props: {
  conversation: ConversationModel
  isConversationActive: (conversation: ConversationModel) => Promise<boolean>
}): Promise<boolean> {
  if (getPendingChallenge(props.conversation)) {
    return false
  }
  return await props.isConversationActive(props.conversation)
}

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
    if (getPendingChallenge(conversation)) {
      return { type: "none" }
    }
    return props.hasText
      ? { type: "handoffReentry", conversation }
      : { type: "none" }
  }

  const challenge = getPendingChallenge(conversation)
  if (challenge) {
    return { type: "challenge", conversation, challenge }
  }

  if (!props.hasText) {
    return { type: "none" }
  }

  return { type: "automatedResponse", conversation }
}
