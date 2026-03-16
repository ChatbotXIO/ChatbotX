import {
  AIAnalyzeImageDefaultFn,
  type AIAnalyzeImageSchema,
  aiAnalyzeImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AIAnalyzeImageEditor from "./editor"
import AIAnalyzeImageViewer from "./viewer"

export const aiAnalyzeImageStep: StepDefinition<AIAnalyzeImageSchema> = {
  editor: AIAnalyzeImageEditor,
  viewer: AIAnalyzeImageViewer,
  validator: aiAnalyzeImageSchema,
  defaultFn: AIAnalyzeImageDefaultFn,
}

export default aiAnalyzeImageStep
