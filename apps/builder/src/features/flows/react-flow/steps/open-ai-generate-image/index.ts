import {
  openAIGenerateImageDefaultFn,
  openAIGenerateImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIGenerateImageEditor } from "./editor"
import { OpenAIGenerateImageViewer } from "./viewer"

export const openAIGenerateImageStep: StepDefinition = {
  editor: OpenAIGenerateImageEditor,
  viewer: OpenAIGenerateImageViewer,
  validator: openAIGenerateImageSchema,
  defaultFn: openAIGenerateImageDefaultFn,
}
