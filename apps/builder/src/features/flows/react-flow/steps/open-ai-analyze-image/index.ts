import type { StepDefinition } from ".."
import { OpenAIAnalyzeImageEditor } from "./editor"
import { openAIAnalyzeImageDefaultFn, openAIAnalyzeImageSchema } from "./schema"
import { OpenAIAnalyzeImageViewer } from "./viewer"

export const openAIAnalyzeImageStep: StepDefinition = {
  editor: OpenAIAnalyzeImageEditor,
  viewer: OpenAIAnalyzeImageViewer,
  validator: openAIAnalyzeImageSchema,
  defaultFn: openAIAnalyzeImageDefaultFn,
}
