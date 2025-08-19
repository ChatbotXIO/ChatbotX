import {
  openAITextToSpeechDefaultFn,
  openAITextToSpeechSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAITextToSpeechEditor } from "./editor"
import { OpenAITextToSpeechViewer } from "./viewer"

export const openAITextToSpeechStep: StepDefinition = {
  editor: OpenAITextToSpeechEditor,
  viewer: OpenAITextToSpeechViewer,
  validator: openAITextToSpeechSchema,
  defaultFn: openAITextToSpeechDefaultFn,
}
