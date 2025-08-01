import type { StepDefinition } from ".."
import { SendAudioStepEditor } from "./editor"
import {
  sendAudioStepSchema,
  sendAudioStepDefaultFn,
} from "@aha.chat/flow-config"
import { SendAudioStepViewer } from "./viewer"

export const sendAudioStep: StepDefinition = {
  editor: SendAudioStepEditor,
  viewer: SendAudioStepViewer,
  validator: sendAudioStepSchema,
  defaultFn: sendAudioStepDefaultFn,
}
