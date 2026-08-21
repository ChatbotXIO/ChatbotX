import { trackingResponseTypes } from "@chatbotx.io/analytics"
import { adsConversionService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type {
  AutomatedResponseModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { keywordMatchesText } from "./keyword-match"

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

  for (const rule of rules) {
    const matched = keywordMatchesText(rule.keywords, lowerCaseText)

    if (!matched) {
      continue
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
      const stepMessage = await contactVariableService.replaceAll({
        text: rule.text,
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
