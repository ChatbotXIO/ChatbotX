import {
  aiAgentService,
  contactInboxService,
  fbCommentAutomationService,
  igStoryAutomationService,
  workspaceService,
} from "@chatbotx.io/business"
import type {
  FBCommentIncludeKeywords,
  IgStoryTarget,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  type IntegrationJobProcessStoryReplyAutomation,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { generateAIReplyText } from "../automated-response/replies"

function matchStory(story: IgStoryTarget, storyId: string): boolean {
  if (story.type !== "storyIds") {
    return true
  }
  return story.value.includes(storyId)
}

// Only the `includeKeywords` half of `comment-automation/index.ts`'s
// `matchKeywords` applies here — this feature has no `excludeKeywords` field.
function matchIncludeKeywords(
  includeKeywords: FBCommentIncludeKeywords,
  message: string | undefined,
): boolean {
  if (includeKeywords.type === "all") {
    return true
  }
  const text = (message ?? "").toLowerCase()
  const keywords = includeKeywords.value.map((k) => k.toLowerCase())
  if (includeKeywords.type === "equal") {
    return keywords.includes(text)
  }
  return keywords.some((k) => text.includes(k))
}

async function sendStoryReplyText(props: {
  text: string
  conversationId: string
  workspaceId: string
  contactInbox: ContactInboxModel
}): Promise<void> {
  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversation: {
        id: props.conversationId,
        workspaceId: props.workspaceId,
      } as ConversationModel,
      contactInbox: props.contactInbox,
      text: props.text,
    },
  })
}

async function dispatchAIAgentReply(props: {
  agentId: string
  workspaceId: string
  conversationId: string
  contactInbox: ContactInboxModel
  message: string | undefined
  onSkipped: (reason: string) => void
}): Promise<boolean> {
  const agent = await aiAgentService.findBy({
    where: { id: props.agentId, workspaceId: props.workspaceId },
  })
  if (!agent) {
    props.onSkipped("AI agent not found")
    return false
  }

  const generated = await generateAIReplyText({
    conversation: {
      id: props.conversationId,
      workspaceId: props.workspaceId,
      contactId: props.contactInbox.contactId,
    } as ConversationModel,
    contactInbox: props.contactInbox,
    messages: [{ role: "user", content: props.message ?? "" }],
    aiAgent: agent,
  })
  if (!generated?.text) {
    props.onSkipped("AI agent produced no text")
    return false
  }

  await sendStoryReplyText({
    text: generated.text,
    conversationId: props.conversationId,
    workspaceId: props.workspaceId,
    contactInbox: props.contactInbox,
  })
  return true
}

const logAutomationSkipped = ({
  automationId,
  messageId,
  storyId,
  workspaceId,
  reason,
}: {
  automationId: string
  messageId: string
  storyId: string
  workspaceId: string
  reason: string
}) => {
  logger.info(
    { automationId, messageId, storyId, workspaceId, reason },
    "Story reply automation skipped",
  )
}

export async function processStoryReplyAutomation(
  data: IntegrationJobProcessStoryReplyAutomation["data"],
): Promise<void> {
  const {
    workspaceId,
    conversationId,
    contactInboxId,
    messageId,
    storyId,
    message,
    channelType,
  } = data

  const contactInbox = await contactInboxService.findBy({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    logger.warn(
      { contactInboxId, workspaceId, messageId },
      "Story reply automation skipped: contactInbox not found",
    )
    return
  }

  const [automations, workspace] = await Promise.all([
    igStoryAutomationService.findActiveAutomations({
      workspaceId,
      channelType,
    }),
    workspaceService.findById({ id: workspaceId }),
  ])

  for (const automation of automations) {
    try {
      if (
        !fbCommentAutomationService.isWithinSchedule(
          automation,
          workspace.timezone,
        )
      ) {
        logAutomationSkipped({
          automationId: automation.id,
          messageId,
          storyId,
          workspaceId,
          reason: "outside schedule",
        })
        continue
      }

      if (!matchStory(automation.story, storyId)) {
        logAutomationSkipped({
          automationId: automation.id,
          messageId,
          storyId,
          workspaceId,
          reason: "story does not match",
        })
        continue
      }

      if (!matchIncludeKeywords(automation.includeKeywords, message)) {
        logAutomationSkipped({
          automationId: automation.id,
          messageId,
          storyId,
          workspaceId,
          reason: "keywords do not match",
        })
        continue
      }

      const reply = automation.reply
      let dispatched = false

      if (reply.type === "text" && reply.value) {
        let text = reply.value
        try {
          const variables = await contactVariableService.getAll({
            contactId: contactInbox.contactId,
            contactInbox,
          })
          text = await contactVariableService.replaceAll({
            text: reply.value,
            variables,
          })
        } catch (err) {
          logger.warn(
            { err, messageId, storyId },
            "Failed to resolve variables in reply text, sending raw text",
          )
        }
        await sendStoryReplyText({
          text,
          conversationId,
          workspaceId,
          contactInbox,
        })
        dispatched = true
      } else if (reply.type === "flow" && reply.value) {
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId,
            contactInboxId,
            flowId: reply.value,
            origin: webhookChannelOrigin(),
          },
        })
        dispatched = true
      } else if (reply.type === "AIAgent" && reply.value) {
        dispatched = await dispatchAIAgentReply({
          agentId: reply.value,
          workspaceId,
          conversationId,
          contactInbox,
          message,
          onSkipped: (reason) =>
            logAutomationSkipped({
              automationId: automation.id,
              messageId,
              storyId,
              workspaceId,
              reason,
            }),
        })
      }

      if (dispatched) {
        await igStoryAutomationService.incrementRepliesCount(automation.id)
      }
    } catch (err) {
      logger.error(
        { err, automationId: automation.id, messageId, workspaceId },
        "Failed to process story reply automation",
      )
    }
  }
}
