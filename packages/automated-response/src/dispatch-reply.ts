import { trackingResponseTypes } from "@chatbotx.io/analytics"
import { adsConversionService } from "@chatbotx.io/business"
import { enqueueLeaderboardAward } from "@chatbotx.io/business/leaderboard"
import { db } from "@chatbotx.io/database/client"
import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import type {
  AutomatedResponseModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { createdAtFromId } from "@chatbotx.io/utils"
import { applySpintax } from "@chatbotx.io/utils/spintax"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import {
  keywordMatchesText,
  keywordMatchModeByAutomatedResponseType,
} from "./keyword-match"

/** Channels whose leaderboards offer the "keywords" rule. */
const KEYWORD_LEADERBOARD_CHANNELS = new Set([
  "messenger",
  "instagram",
  "tiktok",
])

/**
 * Leaderboard "keywords" rule: an inbound message that matches ANY Keywords
 * rule scores once, whatever the rule then sends. The trigger message is the
 * source event (its id is the sourceRef and the time packed in that id the
 * event time), so re-processing the same message never scores twice.
 */
const awardKeywordLeaderboard = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  messageId: string
}): Promise<void> => {
  if (!KEYWORD_LEADERBOARD_CHANNELS.has(props.contactInbox.channel)) {
    return
  }
  const eventAt = createdAtFromId(props.messageId)
  if (!eventAt) {
    return
  }
  await enqueueLeaderboardAward({
    workspaceId: props.conversation.workspaceId,
    contactId: props.contactInbox.contactId,
    inboxId: props.contactInbox.inboxId,
    rule: "keywords",
    sourceRef: props.messageId,
    eventAt,
  })
}

export const dispatchAutomatedResponseReply = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  messageId: string
  text: string
  rules: Pick<
    AutomatedResponseModel,
    "id" | "keywords" | "flowId" | "text" | "type"
  >[]
  triggerType: string
}): Promise<boolean> => {
  const { conversation, contactInbox, messageId, text, rules, triggerType } =
    props
  const lowerCaseText = text.toLowerCase()
  let keywordAwarded = false

  for (const rule of rules) {
    // Match mode is derived from `rule.type` — see the Contact/Page
    // distinction documented at automated-response.ts's
    // `automatedResponseFolderTypeByType`.
    const matched = keywordMatchesText(
      rule.keywords,
      lowerCaseText,
      keywordMatchModeByAutomatedResponseType[
        rule.type as AutomatedResponseType
      ],
    )

    if (!matched) {
      continue
    }

    if (rule.type === "inbound" && !keywordAwarded) {
      keywordAwarded = true
      await awardKeywordLeaderboard({ conversation, contactInbox, messageId })
    }

    // Ads conversion `keywordMatched` trigger: only inbound-type rules
    // (invariant — never outbound, e.g. replyByOutboundAutomatedResponse)
    // and only on WhatsApp, where CTWA attribution exists.
    if (
      rule.type === "inbound" &&
      adsConversionService.isEligibleChannel(contactInbox.channel)
    ) {
      await adsConversionService.enqueueKeywordMatchedEvaluation({
        workspaceId: conversation.workspaceId,
        channel: contactInbox.channel,
        inboxId: contactInbox.inboxId,
        contactInboxId: contactInbox.id,
        automatedResponseId: rule.id,
        messageId,
      })
    }

    if (rule.flowId) {
      const flow = await db.query.flowModel.findFirst({
        where: {
          id: rule.flowId,
          currentVersionId: { isNotNull: true },
        },
      })
      if (flow) {
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            contactInboxId: contactInbox.id,
            flowId: flow.id,
            trackingContext: {
              aiProvider: "none",
              messageId,
              conversationId: conversation.id,
              responseType: trackingResponseTypes.enum.automated_response,
              startTime: Date.now(),
              triggerType,
              workspaceId: conversation.workspaceId,
            },
            origin: webhookChannelOrigin(),
          },
        })
        return true
      }
    } else if (rule.text) {
      const variables = await contactVariableService.getAll({
        contactId: conversation.contactId,
        contactInbox,
        conversation,
      })
      // Spun before the variable pass: a keyword rule's text is author copy,
      // while the contact data substituted into it is not and must ship as-is.
      const stepMessage = await contactVariableService.replaceAll({
        text: applySpintax(rule.text),
        variables,
      })
      await chatQueue.add(ChatJobAction.sendChatMessage, {
        type: ChatJobAction.sendChatMessage,
        data: {
          conversation,
          text: stepMessage,
          trackingContext: {
            aiProvider: "none",
            conversationId: conversation.id,
            messageId,
            responseType: trackingResponseTypes.enum.automated_response,
            startTime: Date.now(),
            triggerType,
            workspaceId: conversation.workspaceId,
          },
        },
      })
      return true
    }
  }

  return false
}
