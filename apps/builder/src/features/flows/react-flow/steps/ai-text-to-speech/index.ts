import {
  AITextToSpeechDefaultFn,
  type AITextToSpeechSchema,
  aiTextToSpeechSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import AITextToSpeechEditor from "./editor"
import AITextToSpeechViewer from "./viewer"

export const aiTextToSpeechStep: StepDefinition<AITextToSpeechSchema> = {
  editor: AITextToSpeechEditor,
  viewer: AITextToSpeechViewer,
  validator: aiTextToSpeechSchema,
  defaultFn: AITextToSpeechDefaultFn,
}
