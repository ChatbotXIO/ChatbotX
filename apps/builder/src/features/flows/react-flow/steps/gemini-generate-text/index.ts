import {
  geminiGenerateTextDefaultFn,
  geminiGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { GeminiGenerateTextEditor } from "./editor"
import { GeminiGenerateTextViewer } from "./viewer"

export const geminiGenerateTextStep: StepDefinition = {
  editor: GeminiGenerateTextEditor,
  viewer: GeminiGenerateTextViewer,
  validator: geminiGenerateTextSchema,
  defaultFn: geminiGenerateTextDefaultFn,
}
