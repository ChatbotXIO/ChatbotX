import {
  type GeminiGenerateTextSchema,
  geminiGenerateTextDefaultFn,
  geminiGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../../definition"
import { GeminiGenerateTextEditor } from "./editor"
import { GeminiGenerateTextViewer } from "./viewer"

export const geminiGenerateTextStep: StepDefinition<GeminiGenerateTextSchema> =
  {
    editor: GeminiGenerateTextEditor,
    viewer: GeminiGenerateTextViewer,
    validator: geminiGenerateTextSchema,
    defaultFn: geminiGenerateTextDefaultFn,
  }
