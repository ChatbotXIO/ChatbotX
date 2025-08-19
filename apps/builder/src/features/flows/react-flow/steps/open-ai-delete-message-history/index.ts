import {
  openAIDeleteMessageHistoryDefaultFn,
  openAIDeleteMessageHistorySchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAIDeleteMessageHistoryEditor } from "./editor"
import { OpenAIDeleteMessageHistoryViewer } from "./viewer"

export const openAIDeleteMessageHistoryStep: StepDefinition = {
  editor: OpenAIDeleteMessageHistoryEditor,
  viewer: OpenAIDeleteMessageHistoryViewer,
  validator: openAIDeleteMessageHistorySchema,
  defaultFn: openAIDeleteMessageHistoryDefaultFn,
}
