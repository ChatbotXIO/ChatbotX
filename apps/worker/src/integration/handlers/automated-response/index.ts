import { db } from "@chatbotx.io/database/client"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import type { OutgoingConversation } from "@chatbotx.io/sdk"
import type { IntegrationJobTriggerAutomatedResponse } from "@chatbotx.io/worker-config"
import type { ModelMessage } from "ai"
import { logger } from "../../../lib/logger"
import { getAIToolset } from "../generate-text/tools"
import { replyByAI, replyByAutomatedResponse } from "./replies"
import { createTrackingContext, trackBotResponse } from "./track-bot-response"

export async function triggerAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
) {
  const { message } = props
  const messageId = (message as { id?: string }).id ?? ""
  const startTime = Date.now()
  try {
    // if (!message.text) {
    //   await trackBotResponse({
    //     workspaceId: message.workspaceId,
    //     conversationId: message.conversationId,
    //     messageId,
    //     hasResponse: false,
    //     responseType: "none",
    //     routeType: "fallback",
    //     result: "fallback",
    //     aiProvider: "none",
    //     startTime: Date.now(),
    //     metadata: {
    //       fallbackReason: "no_content",
    //     },
    //     triggerContext: {
    //       triggerSource: "worker",
    //       triggerHandler: "triggerAutomatedResponse",
    //       triggerType: "bot_response_fallback_no_content",
    //     },
    //   })

    //   return
    // }

    const conversation = await db.query.conversationModel.findFirst({
      where: { id: message.conversationId },
    })
    if (!conversation) {
      return
    }

    if (
      await replyByAutomatedResponse(
        {
          message,
          conversation: conversation as OutgoingConversation,
        },
        createTrackingContext({
          messageId,
          workspaceId: message.workspaceId,
          conversationId: message.conversationId,
          responseType: "automated_response",
          aiProvider: "none",
          triggerType: "bot_response_automated_response",
        }),
      )
    ) {
      return
    }

    const aiAgent = await db.query.aiAgentModel.findFirst({
      where: {
        workspaceId: message.workspaceId,
        isDefault: true,
      },
    })
    if (!aiAgent) {
      await trackBotResponse({
        workspaceId: message.workspaceId,
        conversationId: message.conversationId,
        messageId,
        hasResponse: false,
        responseType: "none",
        routeType: "fallback",
        result: "fallback",
        aiProvider: "none",
        metadata: {
          fallbackReason: "no_ai_agent",
        },
        startTime,
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "triggerAutomatedResponse",
          triggerType: "bot_response_fallback_no_ai_agent",
        },
      })
      return
    }

    const last100Messages = await db.query.messageModel.findMany({
      where: { conversationId: message.conversationId },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    })
    const lastAIMessages: ModelMessage[] = []
    for (const message of last100Messages) {
      if (!message.text) {
        continue
      }
      if (message.senderType === "contact") {
        lastAIMessages.push({
          role: aiMessageRoles.enum.user,
          content: message.text,
        })
      } else if (
        message.senderType === "user" ||
        message.senderType === "bot"
      ) {
        lastAIMessages.push({ role: "assistant", content: message.text })
      }
    }
    lastAIMessages.reverse()

    const toolset = await getAIToolset(aiAgent.workspaceId, aiAgent.tools)

    if (
      await replyByAI({
        message,
        lastAIMessages,
        aiAgent,
        tools: toolset,
        availableTools: {
          fileTools: [],
          functionTools: [],
          mcpTools: [],
        },
      })
    ) {
      // Step 3: AI Agent exists → Route to AGENT
      await trackBotResponse({
        workspaceId: message.workspaceId,
        conversationId: message.conversationId,
        messageId,
        hasResponse: true,
        responseType: "ai_agent",
        routeType: "agent",
        result: "success",
        aiProvider: "openai",
        startTime,
      })
      return
    }

    // Step 4: AI Agent failed to respond → Still routed to AGENT, but response failed
    // This is NOT fallback - routing decision was AGENT, but execution failed
    await trackBotResponse({
      workspaceId: message.workspaceId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: false,
      responseType: "ai_agent",
      routeType: "agent",
      result: "success",
      aiProvider: "none",
      metadata: {
        fallbackReason: "no_intent_match",
      },
      startTime,
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
        conversationId: message.conversationId,
        workspaceId: message.workspaceId,
      },
      "[automated-response] triggerAutomatedResponse failed",
    )
    return
  }
}
