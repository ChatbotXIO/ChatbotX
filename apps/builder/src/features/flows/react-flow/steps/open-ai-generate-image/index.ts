import type { StepDefinition } from ".."
import { OpenAIGenerateImageEditor } from "./editor"
import {
  openAIGenerateImageDefaultFn,
  openAIGenerateImageSchema,
} from "./schema"
import { OpenAIGenerateImageViewer } from "./viewer"

export const openAIGenerateImageStep: StepDefinition = {
  editor: OpenAIGenerateImageEditor,
  viewer: OpenAIGenerateImageViewer,
  validator: openAIGenerateImageSchema,
  defaultFn: openAIGenerateImageDefaultFn,
}
