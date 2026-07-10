import { aiTimeouts } from "@chatbotx.io/ai"
import { aiContextService } from "@chatbotx.io/ai/server"
import { db } from "@chatbotx.io/database/client"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import {
  type AIAgentModelConfig,
  aiAgentProviderModels,
  aiAgentProviders,
} from "@chatbotx.io/database/partials"
import type { AIGenerateTextAgentSchema } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import { runAIAgentRunner } from "../shared/ai-agent-runner"
import type { ExecuteStepResult } from "../step"
import { buildAIAgentMessages } from "./messages"

const OPENAI_COMPATIBLE_INTEGRATION_MISSING_OR_DISABLED =
  "OpenAI-compatible integration is missing or disabled"

export async function handleAIGenerateTextAgent({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<AIGenerateTextAgentSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
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
      return {
        status: "error",
        errorMessage: "AI Agent not found",
        result: null,
      }
    }

    const aiAgentModels = aiAgentProviderModels.parse(aiAgent.models)
    const aiContext = await aiContextService.getOrInitContext({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      preferredModels: aiAgentModels,
    })

    const messages = await buildAIAgentMessages(
      conversation,
      contactInbox,
      step,
    )
    const summary = aiContext?.summary || ""
    const preferredModel = resolvePreferredModel(step)
    const preferredProvider =
      step.provider === "openaiCompatible"
        ? null
        : aiAgentProviders.safeParse(step.provider)

    if (!(preferredModel || preferredProvider?.success)) {
      logger.error(
        {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          stepId: step.id,
          provider: step.provider,
        },
        "[ai-generate-text-agent] Unsupported AI Agent provider",
      )
      return {
        status: "error",
        errorMessage: "Unsupported AI Agent provider",
        result: null,
      }
    }

    const result = await runAIAgentRunner({
      conversation,
      contactInbox,
      messages,
      aiAgent,
      summary,
      ...(preferredModel
        ? { preferredModel }
        : { preferredProvider: preferredProvider?.data }),
    })

    if (!result?.responded && step.provider === "openaiCompatible") {
      return {
        status: "error",
        errorMessage: OPENAI_COMPATIBLE_INTEGRATION_MISSING_OR_DISABLED,
        result: null,
      }
    }

    if (result?.responded && result.fullText && step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: result.fullText,
        workspaceId: conversation.workspaceId,
      })
    }

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        stepId: step.id,
      },
      "[ai-generate-text-agent] Step failed",
    )
    if (isMessageStorageError(err)) {
      throw err
    }
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
  }
}

function resolvePreferredModel(
  step: AIGenerateTextAgentSchema,
): AIAgentModelConfig | null {
  if (step.provider !== "openaiCompatible") {
    return null
  }

  if (!(step.integrationId?.trim() && step.model?.trim())) {
    return null
  }

  return {
    kind: "openaiCompatible",
    integrationId: step.integrationId,
    model: step.model,
  }
}
