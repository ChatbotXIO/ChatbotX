import type { StepDefinition } from ".."
import { OpenAIDeleteMessageHistoryEditor } from "./editor"
import {
  openAIDeleteMessageHistoryDefaultFn,
  openAIDeleteMessageHistorySchema,
} from "@ahachat.ai/flow-config"
import { OpenAIDeleteMessageHistoryViewer } from "./viewer"

export const openAIDeleteMessageHistoryStep: StepDefinition = {
  editor: OpenAIDeleteMessageHistoryEditor,
  viewer: OpenAIDeleteMessageHistoryViewer,
  validator: openAIDeleteMessageHistorySchema,
  defaultFn: openAIDeleteMessageHistoryDefaultFn,
}
