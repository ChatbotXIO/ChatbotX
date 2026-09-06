import { randomUUID } from "node:crypto"
import type { IntegrationJobResumeHeavyStep } from "@chatbotx.io/worker-config"
import { runFlowNode } from "./flow"
import {
  claimHeavyStepResume,
  finishHeavyStepResume,
} from "./heavy-step-runner"

/**
 * Claims the terminal outcome before re-entering the flow. The delayed backup
 * and immediate heavy-worker continuation can race safely: one job runs the
 * flow, while the other is a no-op.
 */
export async function resumeHeavyStep(
  data: IntegrationJobResumeHeavyStep["data"],
): Promise<void> {
  const resumeLeaseToken = randomUUID()
  const claim = await claimHeavyStepResume({
    outcomeKey: data.outcomeKey,
    resumeLeaseToken,
  })
  if (claim !== "claimed") {
    return
  }

  try {
    await runFlowNode(data, { flowExecutionKey: data.flowExecutionKey })
    await finishHeavyStepResume({
      outcomeKey: data.outcomeKey,
      resumeLeaseToken,
      succeeded: true,
    })
  } catch (error) {
    await finishHeavyStepResume({
      outcomeKey: data.outcomeKey,
      resumeLeaseToken,
      succeeded: false,
    })
    throw error
  }
}
