export type {
  ReplyByAIExecutionResult,
  ReplyByAIProps,
} from "../shared/ai-agent-runner"

import {
  type ReplyByAIExecutionResult,
  type ReplyByAIProps,
  runAIAgentRunner,
} from "../shared/ai-agent-runner"

export async function replyByAI(
  props: ReplyByAIProps,
): Promise<null | ReplyByAIExecutionResult> {
  return await runAIAgentRunner(props)
}
