import { runPipelineFlowAction } from "@chatbotx.io/business/pipeline"
import type { PipelineStepSchema } from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

/**
 * "Pipelines" flow step. Business rules (target resolution, validation,
 * dedup keys) live in `runPipelineFlowAction`; this handler only supplies the
 * contact's variable resolver and maps the outcome to step routing.
 */
export async function handlePipelineStep({
  conversation,
  contactInbox,
  flowVersion,
  flowExecutionKey,
  step,
}: ExecuteStepProps<PipelineStepSchema>): Promise<ExecuteStepResult> {
  const { workspaceId, contactId } = conversation
  try {
    // Loaded once per step; the context carries one lazy pipeline-item query
    // that every text field shares.
    let variables: Awaited<ReturnType<typeof contactVariableService.getAll>>
    const outcome = await runPipelineFlowAction(step, {
      workspaceId,
      contactId,
      flowId: flowVersion.flowId,
      flowExecutionKey,
      interpolate: async (text) => {
        if (!text.includes("{{")) {
          return text
        }
        variables ??= await contactVariableService.getAll({
          contactId,
          contactInbox,
          conversation,
        })
        return await contactVariableService.replaceAll({ text, variables })
      },
    })
    if (outcome.status !== "success") {
      logger.info(
        {
          workspaceId,
          contactId,
          stepId: step.id,
          action: step.action,
          status: outcome.status,
          reason: outcome.message,
        },
        "Pipeline step did not apply",
      )
    }
    return {
      status: outcome.status,
      result: null,
      errorMessage: outcome.status === "error" ? outcome.message : undefined,
    }
  } catch (error: unknown) {
    logger.error(
      { err: error, workspaceId, contactId, stepId: step.id },
      "Pipeline step failed",
    )
    // `runPipelineFlowAction` already maps caller-fixable problems to an
    // `error` outcome; anything else (database or Redis down) propagates so the
    // job retries, and the dedup key keeps the retried step idempotent.
    throw error
  }
}
