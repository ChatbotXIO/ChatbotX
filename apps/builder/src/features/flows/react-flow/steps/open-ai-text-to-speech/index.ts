import type { StepDefinition } from ".."
import { OpenAITextToSpeechEditor } from "./editor"
import {
  openAITextToSpeechSchema,
  openAITextToSpeechDefaultFn,
} from "@ahachat.ai/flow-config"
import { OpenAITextToSpeechViewer } from "./viewer"

export const openAITextToSpeechStep: StepDefinition = {
  editor: OpenAITextToSpeechEditor,
  viewer: OpenAITextToSpeechViewer,
  validator: openAITextToSpeechSchema,
  defaultFn: openAITextToSpeechDefaultFn,
}
