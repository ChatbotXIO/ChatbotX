import type { FlowStepProps } from "../step-handler"
import { handleAIGenerateText } from "./index"

export async function handleOpenAIGenerateText(
  props: FlowStepProps<Record<string, unknown>>,
) {
  return await handleAIGenerateText(props)
}
