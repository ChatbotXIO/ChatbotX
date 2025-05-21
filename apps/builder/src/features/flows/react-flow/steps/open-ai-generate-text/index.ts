import type { StepDefinition } from ".."
import { OpenAIGenerateTextEditor } from "./editor"
import {
  openAIGenerateTextSchema,
  openAIGenerateTextDefaultFn,
} from "@ahachat.ai/flow-config"
import { OpenAIGenerateTextViewer } from "./viewer"

export const openAIGenerateTextStep: StepDefinition = {
  editor: OpenAIGenerateTextEditor,
  viewer: OpenAIGenerateTextViewer,
  validator: openAIGenerateTextSchema,
  defaultFn: openAIGenerateTextDefaultFn,
}
