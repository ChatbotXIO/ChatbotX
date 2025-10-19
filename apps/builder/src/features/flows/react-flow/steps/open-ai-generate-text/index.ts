import {
  openAIGenerateTextDefaultFn,
  openAIGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIGenerateTextEditor } from "./editor"
import { OpenAIGenerateTextViewer } from "./viewer"

export const openAIGenerateTextStep: StepDefinition = {
  editor: OpenAIGenerateTextEditor,
  viewer: OpenAIGenerateTextViewer,
  validator: openAIGenerateTextSchema,
  defaultFn: openAIGenerateTextDefaultFn,
}
