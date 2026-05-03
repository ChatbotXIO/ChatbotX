import { aiContextService } from "@chatbotx.io/ai/server"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationJobProcessAutomatedResponse } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { detectConversationAndContactInbox } from "../../../lib/db"
import { logger } from "../../../lib/logger"
import { replyByAI } from "./replies"
import { trackBotResponse } from "./track-bot-response"

export async function processAutomatedResponse(
  props: IntegrationJobProcessAutomatedResponse["data"],
) {
  const { conversationId, contactInboxId } = props
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId,
      contactInboxId,
    })

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

    const aiContext = await aiContextService.getOrInitContext({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    })

    let messages: ModelMessage[] = []
    let summary = ""

    if (aiContext) {
      const latestContactMessage = await db.query.messageModel.findFirst({
        where: {
          conversationId: conversation.id,
          senderType: "contact",
        },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      })

      if (latestContactMessage?.text) {
        await aiContextService.appendHistory({
          conversationId: conversation.id,
          newMessages: [
            {
              message: {
                role: "user",
                content: latestContactMessage.text,
              },
              messageId: latestContactMessage.id,
              createdAt: latestContactMessage.createdAt.getTime(),
            },
          ],
        })
      }

      const refreshedContext = await aiContextService.getOrInitContext({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      })

      if (refreshedContext) {
        messages = aiContextService.mapContextToModelMessages(
          refreshedContext.history,
        )
        summary = refreshedContext.summary
      }
    } else {
      const last100Messages = await db.query.messageModel.findMany({
        where: { conversationId: conversation.id },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        limit: 100,
      })
      const dbMessages = [...last100Messages].reverse()
      messages = aiContextService.mapMessages(dbMessages)
    }

    const startTime = Date.now()
    const aiResult = await replyByAI({
      conversation,
      messages,
      aiAgent,
      summary,
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
