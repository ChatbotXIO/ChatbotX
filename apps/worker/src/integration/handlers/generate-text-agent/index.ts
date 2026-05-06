import { aiContextService } from "@chatbotx.io/ai/server"
import { db } from "@chatbotx.io/database/client"
import { aiAgentProviders } from "@chatbotx.io/database/partials"
import {
  type AIGenerateTextAgentSchema,
  aiGenerateTextAgentSchema as ZodSchema,
} from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import { runAIAgentRunner } from "../shared/ai-agent-runner"
import { buildAIAgentMessages } from "./messages"

export async function handleAIGenerateTextAgent({
  conversation,
  step: rawStep,
}: ExecuteStepProps<AIGenerateTextAgentSchema>) {
  try {
    const step = ZodSchema.parse(rawStep)

    const aiAgent = await db.query.aiAgentModel.findFirst({
      where: {
        id: step.aiAgentId,
        workspaceId: conversation.workspaceId,
      },
    })

    if (!aiAgent) {
      logger.error(
        { workspaceId: conversation.workspaceId, aiAgentId: step.aiAgentId },
        "[ai-generate-text-agent] AI Agent not found",
      )
      return
    }

    const aiContext = await aiContextService.getOrInitContext({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    })

    const messages = await buildAIAgentMessages(conversation, step)
    const summary = aiContext?.summary || ""
    const preferredProvider = aiAgentProviders.safeParse(step.provider)

    if (!preferredProvider.success) {
      logger.error(
        {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          stepId: step.id,
          provider: step.provider,
        },
        "[ai-generate-text-agent] Unsupported AI Agent provider",
      )
      return
    }

    const result = await runAIAgentRunner({
      conversation,
      messages,
      aiAgent,
      summary,
      preferredProvider: preferredProvider.data,
    })

    if (result?.responded && result.fullText && step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: result.fullText,
        workspaceId: conversation.workspaceId,
      })
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      {
        error: parsedError,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        stepId: rawStep.id,
      },
      "[ai-generate-text-agent] Step failed",
    )
    throw error
  }
}
