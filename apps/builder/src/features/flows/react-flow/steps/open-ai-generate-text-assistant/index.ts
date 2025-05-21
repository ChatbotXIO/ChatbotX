import type { StepDefinition } from ".."
import { OpenAIGenerateTextAssistantEditor } from "./editor"
import {
  openAIGenerateTextAssistantSchema,
  openAIGenerateTextAssistantDefaultFn,
} from "@ahachat.ai/flow-config"
import { OpenAIGenerateTextAssistantViewer } from "./viewer"

export const openAIGenerateTextAssistantStep: StepDefinition = {
  editor: OpenAIGenerateTextAssistantEditor,
  viewer: OpenAIGenerateTextAssistantViewer,
  validator: openAIGenerateTextAssistantSchema,
  defaultFn: openAIGenerateTextAssistantDefaultFn,
}
