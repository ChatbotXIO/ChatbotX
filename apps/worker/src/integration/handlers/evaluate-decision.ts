import { createHash } from "node:crypto"
import { decisionEvaluationService } from "@chatbotx.io/business"
import type { EvaluateDecisionStepSchema } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function evaluateDecision(
  props: ExecuteStepProps<EvaluateDecisionStepSchema>,
): Promise<ExecuteStepResult> {
  const flowExecutionKey = props.flowExecutionKey ?? `flow-inline-${createId()}`
  const decisionExecutionKey = `decision-${createHash("sha256")
    .update(`${flowExecutionKey}:${props.step.id}`)
    .digest("hex")}`
  const outcome = await decisionEvaluationService.evaluateFlow({
    contactId: props.contactInbox.contactId,
    contactInboxId: props.contactInbox.id,
    conversationId: props.conversation.id,
    decisionExecutionKey,
    flowId: props.flowVersion.flowId,
    step: props.step,
    workspaceId: props.conversation.workspaceId,
  })
  return { result: null, status: outcome.status }
}
