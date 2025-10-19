import type { ClaudeGenerateTextSchema } from "@aha.chat/flow-config"
import type { FlowStepProps } from "../step-handler"
import { handleAIGenerateText } from "./index"

export async function handleClaudeGenerateText(
  props: FlowStepProps<ClaudeGenerateTextSchema>,
) {
  return handleAIGenerateText(props)
}
