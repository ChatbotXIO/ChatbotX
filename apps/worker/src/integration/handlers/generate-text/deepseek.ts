import type { DeepseekGenerateTextSchema } from "@aha.chat/flow-config"
import type { FlowStepProps } from "../step-handler"
import { handleAIGenerateText } from "./index"

export async function handleDeepseekGenerateText(
  props: FlowStepProps<DeepseekGenerateTextSchema>,
) {
  return handleAIGenerateText(props)
}
