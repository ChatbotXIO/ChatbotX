import type { OpenAIGenerateTextSchema } from "@aha.chat/flow-config"
import type { FlowStepProps } from "../step-handler"
import { handleAIGenerateText } from "./index"

export async function handleOpenAIGenerateText(
  props: FlowStepProps<OpenAIGenerateTextSchema>,
) {
  return handleAIGenerateText(props)
}
