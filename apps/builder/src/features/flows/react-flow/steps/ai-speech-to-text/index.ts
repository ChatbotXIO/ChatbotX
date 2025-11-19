import {
  AISpeechToTextDefaultFn,
  AISpeechToTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AISpeechToTextEditor from "./editor"
import AISpeechToTextViewer from "./viewer"

export const AISpeechToTextStep: StepDefinition<AISpeechToTextSchema> = {
  editor: AISpeechToTextEditor,
  viewer: AISpeechToTextViewer,
  validator: AISpeechToTextSchema,
  defaultFn: AISpeechToTextDefaultFn,
}
