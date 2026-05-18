import {
  AISpeechToTextDefaultFn,
  type AISpeechToTextSchema,
  aiSpeechToTextSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import AISpeechToTextEditor from "./editor"
import AISpeechToTextViewer from "./viewer"

export const aiSpeechToTextStep: StepDefinition<AISpeechToTextSchema> = {
  editor: AISpeechToTextEditor,
  viewer: AISpeechToTextViewer,
  validator: aiSpeechToTextSchema,
  defaultFn: AISpeechToTextDefaultFn,
}
