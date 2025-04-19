import type { StepDefinition } from ".."
import { OpenAISpeechToTextEditor } from "./editor"
import { openAISpeechToTextDefaultFn, openAISpeechToTextSchema } from "./schema"
import { OpenAISpeechToTextViewer } from "./viewer"

export const openAISpeechToTextStep: StepDefinition = {
  editor: OpenAISpeechToTextEditor,
  viewer: OpenAISpeechToTextViewer,
  validator: openAISpeechToTextSchema,
  defaultFn: openAISpeechToTextDefaultFn,
}
