import {
  AIAnalyzeImageDefaultFn,
  AIAnalyzeImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AIAnalyzeImageEditor from "./editor"
import AIAnalyzeImageViewer from "./viewer"

export const aiAnalyzeImageStep: StepDefinition<AIAnalyzeImageSchema> = {
  editor: AIAnalyzeImageEditor,
  viewer: AIAnalyzeImageViewer,
  validator: AIAnalyzeImageSchema,
  defaultFn: AIAnalyzeImageDefaultFn,
}
