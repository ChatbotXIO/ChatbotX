import { conversationService } from "@chatbotx.io/business"
import type {
  ConversationModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { getStoryReply, isStoryMention } from "@chatbotx.io/sdk"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import { shouldRunStoryMentionAutomation } from "./routing"

/**
 * Hands an inbound story reply or story mention to its story automations.
 * Returns true when the message was dispatched, so the caller skips keyword
 * rules and the Default Reply for it.
 */
export async function dispatchStoryAutomation(props: {
  message: Pick<
    MessageModel,
    "id" | "contactInboxId" | "contentAttributes" | "text"
  >
  conversation: ConversationModel
  channelType: "instagram" | "instagramFacebook"
}): Promise<boolean> {
  const { message, conversation, channelType } = props
  const jobData = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    contactInboxId: message.contactInboxId,
    messageId: message.id,
    channelType,
  }

  const storyReply = getStoryReply(message.contentAttributes)
  if (storyReply) {
    await aiAgentQueue.add(
      AIJobAction.processStoryReplyAutomation,
      {
        type: AIJobAction.processStoryReplyAutomation,
        data: {
          ...jobData,
          storyId: storyReply.id,
          storyUrl: storyReply.url,
          message: message.text ?? undefined,
        },
      },
      { jobId: `story-reply-auto-${message.id}` },
    )
    return true
  }

  if (
    isStoryMention(message.contentAttributes) &&
    (await shouldRunStoryMentionAutomation({
      conversation,
      isConversationActive: (conversation) =>
        conversationService.ensureActive(conversation),
    }))
  ) {
    await aiAgentQueue.add(
      AIJobAction.processStoryMentionAutomation,
      { type: AIJobAction.processStoryMentionAutomation, data: jobData },
      { jobId: `story-mention-auto-${message.id}` },
    )
    return true
  }

  return false
}
