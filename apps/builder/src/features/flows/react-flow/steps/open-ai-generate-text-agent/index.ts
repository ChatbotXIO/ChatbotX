import type { StepDefinition } from ".."
import { OpenAIGenerateTextAgentEditor } from "./editor"
import {
  openAIGenerateTextAgentSchema,
  openAIGenerateTextAgentDefaultFn,
} from "./schema"
import { OpenAIGenerateTextAgentViewer } from "./viewer"

export const openAIGenerateTextAgentStep: StepDefinition = {
  editor: OpenAIGenerateTextAgentEditor,
  viewer: OpenAIGenerateTextAgentViewer,
  validator: openAIGenerateTextAgentSchema,
  defaultFn: openAIGenerateTextAgentDefaultFn,
}
