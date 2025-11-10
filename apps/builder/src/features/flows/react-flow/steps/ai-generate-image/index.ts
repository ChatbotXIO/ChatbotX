import {
  AIGenerateImageDefaultFn,
  AIGenerateImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AIGenerateImageEditor from "./editor"
import AIGenerateImageViewer from "./viewer"

export const aiGenerateImageStep: StepDefinition<AIGenerateImageSchema> = {
  editor: AIGenerateImageEditor,
  viewer: AIGenerateImageViewer,
  validator: AIGenerateImageSchema,
  defaultFn: AIGenerateImageDefaultFn,
}
