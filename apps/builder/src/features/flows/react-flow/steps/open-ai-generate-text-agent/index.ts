import type { StepDefinition } from ".."
import { OpenAIGenerateTextAgentEditor } from "./editor"
import {
  openAIGenerateTextAgentSchema,
  openAIGenerateTextAgentDefaultFn,
} from "@ahachat.ai/flow-config"
import { OpenAIGenerateTextAgentViewer } from "./viewer"

export const openAIGenerateTextAgentStep: StepDefinition = {
  editor: OpenAIGenerateTextAgentEditor,
  viewer: OpenAIGenerateTextAgentViewer,
  validator: openAIGenerateTextAgentSchema,
  defaultFn: openAIGenerateTextAgentDefaultFn,
}
