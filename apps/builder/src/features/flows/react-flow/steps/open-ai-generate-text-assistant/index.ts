import {
  openAIGenerateTextAssistantDefaultFn,
  openAIGenerateTextAssistantSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIGenerateTextAssistantEditor } from "./editor"
import { OpenAIGenerateTextAssistantViewer } from "./viewer"

export const openAIGenerateTextAssistantStep: StepDefinition = {
  editor: OpenAIGenerateTextAssistantEditor,
  viewer: OpenAIGenerateTextAssistantViewer,
  validator: openAIGenerateTextAssistantSchema,
  defaultFn: openAIGenerateTextAssistantDefaultFn,
}
