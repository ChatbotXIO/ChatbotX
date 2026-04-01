import {
  AITextToSpeechDefaultFn,
  AITextToSpeechSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import AITextToSpeechEditor from "./editor"
import AITextToSpeechViewer from "./viewer"

export const AITextToSpeechStep: StepDefinition<AITextToSpeechSchema> = {
  editor: AITextToSpeechEditor,
  viewer: AITextToSpeechViewer,
  validator: AITextToSpeechSchema,
  defaultFn: AITextToSpeechDefaultFn,
}
