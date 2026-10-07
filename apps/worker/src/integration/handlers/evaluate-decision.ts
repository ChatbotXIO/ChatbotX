import { decisionEvaluationService } from "@chatbotx.io/business"
import type { EvaluateDecisionStepSchema } from "@chatbotx.io/flow-config"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function evaluateDecision(
  props: ExecuteStepProps<EvaluateDecisionStepSchema>,
): Promise<ExecuteStepResult> {
  const outcome = await decisionEvaluationService.evaluateFlow({
    contactId: props.contactInbox.contactId,
    contactInboxId: props.contactInbox.id,
    conversationId: props.conversation.id,
    flowId: props.flowVersion.flowId,
    step: props.step,
    triggerMessageCreatedAt: props.triggerMessageCreatedAt,
    triggerMessageId: props.triggerMessageId,
    workspaceId: props.conversation.workspaceId,
  })
  return { result: null, status: outcome.status }
}
