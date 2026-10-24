import {
  aiAgentService,
  commentAutomationService,
  contactInboxService,
  igStoryAutomationService,
  workspaceService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import {
  type CommentIncludeKeywords,
  type IgStoryAutomationTrigger,
  type IgStoryTarget,
  igStoryAutomationTriggers,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ConversationModel,
  IgStoryAutomationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"
import { applySpintax } from "@chatbotx.io/utils/spintax"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  type AIJobProcessStoryMentionAutomation,
  type AIJobProcessStoryReplyAutomation,
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
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
  includeKeywords: CommentIncludeKeywords,
  message: string | undefined,
): boolean {
  if (includeKeywords.type === "all") {
    return true
  }
  const text = normalizeForMatch(message ?? "")
  const keywords = includeKeywords.value.map((k) => normalizeForMatch(k))
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

// A story mention usually carries no text, so the AI agent is told what
// happened instead of being handed an empty message.
const STORY_MENTION_AI_MESSAGE =
  "The contact mentioned your account in their Instagram story."

const automationLabels: Record<IgStoryAutomationTrigger, string> = {
  storyReply: "Story reply automation",
  storyMention: "Story mention automation",
}

type StoryAutomationEvent = {
  trigger: IgStoryAutomationTrigger
  workspaceId: string
  conversationId: string
  contactInboxId: string
  messageId: string
  channelType: "instagram" | "instagramFacebook"
  // Text handed to an AI agent reply.
  aiMessage: string | undefined
  // Extra fields carried on every log line (e.g. the story id).
  logContext: Record<string, unknown>
  // Returns why the automation does not apply, or null when it does.
  findMismatch: (automation: IgStoryAutomationModel) => string | null
}

export async function processStoryReplyAutomation(
  data: AIJobProcessStoryReplyAutomation["data"],
): Promise<void> {
  const { storyId, message } = data
  await runStoryAutomations({
    ...data,
    trigger: igStoryAutomationTriggers.enum.storyReply,
    aiMessage: message,
    logContext: { storyId },
    findMismatch: (automation) => {
      if (!matchStory(automation.story, storyId)) {
        return "story does not match"
      }
      if (!matchIncludeKeywords(automation.includeKeywords, message)) {
        return "keywords do not match"
      }
      return null
    },
  })
}

// The mention happens on the contact's own story, so there is no story or
// keyword filter: every active, in-schedule automation applies.
export async function processStoryMentionAutomation(
  data: AIJobProcessStoryMentionAutomation["data"],
): Promise<void> {
  await runStoryAutomations({
    ...data,
    trigger: igStoryAutomationTriggers.enum.storyMention,
    aiMessage: STORY_MENTION_AI_MESSAGE,
    logContext: {},
    findMismatch: () => null,
  })
}

async function runStoryAutomations(event: StoryAutomationEvent): Promise<void> {
  const {
    trigger,
    workspaceId,
    conversationId,
    contactInboxId,
    messageId,
    channelType,
    aiMessage,
    logContext,
  } = event
  const label = automationLabels[trigger]

  const contactInbox = await contactInboxService.findBy({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    logger.warn(
      { contactInboxId, workspaceId, messageId },
      `${label} skipped: contactInbox not found`,
    )
    return
  }

  const [automations, workspace] = await Promise.all([
    igStoryAutomationService.findActiveAutomations({
      workspaceId,
      channelType,
      trigger,
      inboxId: contactInbox.inboxId,
    }),
    workspaceService.findById({ id: workspaceId }),
  ])

  const logAutomationSkipped = (automationId: string, reason: string) => {
    logger.info(
      { automationId, messageId, workspaceId, reason, ...logContext },
      `${label} skipped`,
    )
  }

  for (const automation of automations) {
    try {
      if (
        !commentAutomationService.isWithinSchedule(
          automation,
          workspace.timezone,
        )
      ) {
        logAutomationSkipped(automation.id, "outside schedule")
        continue
      }

      const mismatch = event.findMismatch(automation)
      if (mismatch) {
        logAutomationSkipped(automation.id, mismatch)
        continue
      }

      const reply = automation.reply
      let dispatched = false

      if (reply.type === "text" && reply.value) {
        // Spun before the variable pass, and outside the try/catch, so a reply
        // still varies even when contact data fails to load and the raw text
        // below is what ships.
        const spunValue = applySpintax(reply.value)
        let text = spunValue
        try {
          const variables = await contactVariableService.getAll({
            contactId: contactInbox.contactId,
            contactInbox,
          })
          text = await contactVariableService.replaceAll({
            text: spunValue,
            variables,
          })
        } catch (err) {
          logger.warn(
            { err, messageId, ...logContext },
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
          message: aiMessage,
          onSkipped: (reason) => logAutomationSkipped(automation.id, reason),
        })
      }

      if (dispatched) {
        await igStoryAutomationService.incrementRepliesCount(automation.id)
      }
    } catch (err) {
      logger.error(
        { err, automationId: automation.id, messageId, workspaceId },
        `Failed to process ${label.toLowerCase()}`,
      )
      await logProviderError({
        provider: "instagram",
        workspaceId,
        contactId: contactInbox.contactId,
        sourceId: contactInbox.sourceId,
        error: err,
      })
    }
  }
}
