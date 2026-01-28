import {
  AIGenerateImageDefaultFn,
  type AIGenerateImageSchema,
  aiGenerateImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AIGenerateImageEditor from "./editor"
import AIGenerateImageViewer from "./viewer"

export const aiGenerateImageStep: StepDefinition<AIGenerateImageSchema> = {
  editor: AIGenerateImageEditor,
  viewer: AIGenerateImageViewer,
  validator: aiGenerateImageSchema,
  defaultFn: AIGenerateImageDefaultFn,
}
