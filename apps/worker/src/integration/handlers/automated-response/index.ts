import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import type { IntegrationJobProcessAutomatedResponse } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { logger } from "../../../lib/logger"
import { replyByAI } from "./replies"
import { trackBotResponse } from "./track-bot-response"

export async function processAutomatedResponse(
  props: IntegrationJobProcessAutomatedResponse["data"],
) {
  const { conversationId, contactInboxId } = props
  const conversation = await db.query.conversationModel.findFirst({
    where: { id: conversationId },
  })
  if (!conversation?.botEnabled) {
    logger.debug(props, "Conversation is not enable bot")
    return
  }

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: { id: contactInboxId, contactId: conversation.contactId },
  })
  if (!contactInbox) {
    logger.debug(props, "Contact inbox not found")
    return
  }

  const repliedByAutomatedResponse = await automatedResponseService.process({
    conversation,
    contactInbox,
  })
  if (repliedByAutomatedResponse) {
    return
  }

  try {
    const aiAgent = await db.query.aiAgentModel.findFirst({
      where: {
        workspaceId: conversation.workspaceId,
        isDefault: true,
      },
    })

    if (!aiAgent) {
      await trackBotResponse({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId: "",
        hasResponse: false,
        responseType: "none",
        routeType: "fallback",
        result: "fallback",
        aiProvider: "none",
        metadata: {
          fallbackReason: "no_ai_agent",
        },
        startTime: Date.now(),
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "triggerAutomatedResponse",
          triggerType: "bot_response_fallback_no_ai_agent",
        },
      })
      return
    }

    const last100Messages = await db.query.messageModel.findMany({
      where: { conversationId: conversation.id },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    })
    const messages: ModelMessage[] = []
    for (const message of last100Messages) {
      if (!message.text) {
        continue
      }
      if (message.senderType === "contact") {
        messages.push({
          role: aiMessageRoles.enum.user,
          content: message.text,
        })
      } else if (
        message.senderType === "user" ||
        message.senderType === "bot"
      ) {
        messages.push({ role: "assistant", content: message.text })
      }
    }
    messages.reverse()

    const startTime = Date.now()
    const aiResult = await replyByAI({
      conversation,
      messages,
      aiAgent,
    })

    if (aiResult) {
      // Step 3: AI Agent exists → Route to AGENT
      await trackBotResponse({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        messageId: "",
        hasResponse: true,
        responseType: "ai_agent",
        routeType: "agent",
        result: "success",
        aiProvider: aiResult.provider,
        metadata: {},
        startTime,
      })
      return
    }

    // Step 4: AI Agent failed to respond → Still routed to AGENT, but response failed
    // This is NOT fallback - routing decision was AGENT, but execution failed
    await trackBotResponse({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageId: "",
      hasResponse: false,
      responseType: "ai_agent",
      routeType: "agent",
      result: "success",
      aiProvider: "none",
      metadata: {
        fallbackReason: "no_intent_match",
      },
      startTime: Date.now(),
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "triggerAutomatedResponse",
        triggerType: "bot_response_ai_agent_failed",
      },
    })
  } catch (error) {
    logger.error(
      {
        error,
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
      },
      "[automated-response] triggerAutomatedResponse failed",
    )
  }
}
