import type { StepDefinition } from ".."
import { OpenAIGenerateTextAgentEditor } from "./editor"
import {
  openAIGenerateTextAgentSchema,
  openAIGenerateTextAgentDefaultFn,
} from "@aha.chat/flow-config"
import { OpenAIGenerateTextAgentViewer } from "./viewer"

export const openAIGenerateTextAgentStep: StepDefinition = {
  editor: OpenAIGenerateTextAgentEditor,
  viewer: OpenAIGenerateTextAgentViewer,
  validator: openAIGenerateTextAgentSchema,
  defaultFn: openAIGenerateTextAgentDefaultFn,
}
