import {
  openAIAnalyzeImageDefaultFn,
  openAIAnalyzeImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIAnalyzeImageEditor } from "./editor"
import { OpenAIAnalyzeImageViewer } from "./viewer"

export const openAIAnalyzeImageStep: StepDefinition = {
  editor: OpenAIAnalyzeImageEditor,
  viewer: OpenAIAnalyzeImageViewer,
  validator: openAIAnalyzeImageSchema,
  defaultFn: openAIAnalyzeImageDefaultFn,
}
