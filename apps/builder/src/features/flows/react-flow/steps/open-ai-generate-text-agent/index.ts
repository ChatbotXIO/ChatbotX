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
  schema: openAIGenerateTextAgentSchema,
  defaultValue: openAIGenerateTextAgentDefaultFn,
}
