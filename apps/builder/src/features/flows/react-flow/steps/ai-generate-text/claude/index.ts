import {
  type ClaudeGenerateTextSchema,
  claudeGenerateTextDefaultFn,
  claudeGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../../definition"
import { ClaudeGenerateTextEditor } from "./editor"
import { ClaudeGenerateTextViewer } from "./viewer"

export const claudeGenerateTextStep: StepDefinition<ClaudeGenerateTextSchema> =
  {
  editor: ClaudeGenerateTextEditor,
  viewer: ClaudeGenerateTextViewer,
  validator: claudeGenerateTextSchema,
  defaultFn: claudeGenerateTextDefaultFn,
}
