import type { StepDefinition } from ".."
import { OpenAIGenerateTextAdvancedEditor } from "./editor"
import {
  openAIGenerateTextAdvancedDefaultFn,
  openAIGenerateTextAdvancedSchema,
} from "./schema"
import { OpenAIGenerateTextAdvancedViewer } from "./viewer"

export const openAIGenerateTextAdvancedStep: StepDefinition = {
  editor: OpenAIGenerateTextAdvancedEditor,
  viewer: OpenAIGenerateTextAdvancedViewer,
  validator: openAIGenerateTextAdvancedSchema,
  defaultFn: openAIGenerateTextAdvancedDefaultFn,
}
