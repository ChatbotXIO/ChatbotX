import {
  openAISpeechToTextDefaultFn,
  openAISpeechToTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OpenAISpeechToTextEditor } from "./editor"
import { OpenAISpeechToTextViewer } from "./viewer"

export const openAISpeechToTextStep: StepDefinition = {
  editor: OpenAISpeechToTextEditor,
  viewer: OpenAISpeechToTextViewer,
  validator: openAISpeechToTextSchema,
  defaultFn: openAISpeechToTextDefaultFn,
}
