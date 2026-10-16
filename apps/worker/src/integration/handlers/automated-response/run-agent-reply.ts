import {
  type ReplyByAIExecutionResult,
  type ReplyByAIProps,
  replyByAI,
} from "./replies"

/**
 * Single dispatch seam for the legacy Default AI Agent and a selected Global
 * Router agent. Keeping this wrapper means route-specific tracking context is
 * forwarded through every reply implementation without duplicating provider,
 * timeout, tool, rich-response, or fallback behavior.
 */
export async function runAgentReply(
  input: ReplyByAIProps,
): Promise<null | ReplyByAIExecutionResult> {
  return await replyByAI(input)
}
