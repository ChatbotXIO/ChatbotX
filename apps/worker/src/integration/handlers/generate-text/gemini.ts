import type { GeminiGenerateTextSchema } from "@aha.chat/flow-config"
import type { FlowStepProps } from "../step-handler"
import { handleAIGenerateText } from "./index"

export async function handleGeminiGenerateText(
  props: FlowStepProps<GeminiGenerateTextSchema>,
) {
  return handleAIGenerateText(props)
}
