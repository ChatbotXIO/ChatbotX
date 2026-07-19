import { conversationService } from "@chatbotx.io/business"
import type { QuestionnairesStepSchema } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { runQuestionnaireEngine } from "../../questionnaires/services/engine"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

async function clearChallengeSafely(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
) {
  try {
    await conversationService.updateChallenge({
      workspaceId: props.conversation.workspaceId,
      conversationId: props.conversation.id,
      challenge: undefined,
    })
  } catch (err) {
    logger.warn(
      {
        err: normalizeError(err),
        workspaceId: props.conversation.workspaceId,
        conversationId: props.conversation.id,
      },
      "Questionnaires step failed to clear challenge after error",
    )
  }
}

export async function questionnaires(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
): Promise<ExecuteStepResult> {
  try {
    return await runQuestionnaireEngine(props)
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        workspaceId: props.conversation.workspaceId,
        conversationId: props.conversation.id,
        contactId: props.conversation.contactId,
        questionnaireId: props.step.questionnaireId,
        mode: props.step.mode,
      },
      "Questionnaires step failed",
    )
    await clearChallengeSafely(props)
    return { status: "error", result: null }
  }
}
