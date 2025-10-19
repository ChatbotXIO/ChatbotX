import {
  claudeGenerateTextDefaultFn,
  claudeGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { ClaudeGenerateTextEditor } from "./editor"
import { ClaudeGenerateTextViewer } from "./viewer"

export const claudeGenerateTextStep: StepDefinition = {
  editor: ClaudeGenerateTextEditor,
  viewer: ClaudeGenerateTextViewer,
  validator: claudeGenerateTextSchema,
  defaultFn: claudeGenerateTextDefaultFn,
}
