import {
  openAIGenerateTextAgentDefaultFn,
  openAIGenerateTextAgentSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIGenerateTextAgentEditor } from "./editor"
import { OpenAIGenerateTextAgentViewer } from "./viewer"

export const openAIGenerateTextAgentStep: StepDefinition = {
  editor: OpenAIGenerateTextAgentEditor,
  viewer: OpenAIGenerateTextAgentViewer,
  validator: openAIGenerateTextAgentSchema,
  defaultFn: openAIGenerateTextAgentDefaultFn,
}
