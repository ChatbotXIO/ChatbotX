import {
  openAIGenerateTextAdvancedDefaultFn,
  openAIGenerateTextAdvancedSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIGenerateTextAdvancedEditor } from "./editor"
import { OpenAIGenerateTextAdvancedViewer } from "./viewer"

export const openAIGenerateTextAdvancedStep: StepDefinition = {
  editor: OpenAIGenerateTextAdvancedEditor,
  viewer: OpenAIGenerateTextAdvancedViewer,
  validator: openAIGenerateTextAdvancedSchema,
  defaultFn: openAIGenerateTextAdvancedDefaultFn,
}
