import type { StepDefinition } from ".."
import { OpenAIGenerateTextEditor } from "./editor"
import {
  type AIGenerateTextSchema,
  aiGenerateTextDefaultFn,
  aiGenerateTextSchema,
} from "./schema"
import { OpenAIGenerateTextViewer } from "./viewer"

export const aiGenerateTextStep: StepDefinition<AIGenerateTextSchema> = {
  editor: OpenAIGenerateTextEditor,
  viewer: OpenAIGenerateTextViewer,
  validator: aiGenerateTextSchema,
  defaultFn: aiGenerateTextDefaultFn,
}
