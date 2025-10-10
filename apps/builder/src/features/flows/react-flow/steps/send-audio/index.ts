import {
  sendAudioStepDefaultFn,
  sendAudioStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SendAudioStepEditor } from "./editor"
import { SendAudioStepViewer } from "./viewer"

const sendAudioStep: StepDefinition = {
  editor: SendAudioStepEditor,
  viewer: SendAudioStepViewer,
  validator: sendAudioStepSchema,
  defaultFn: sendAudioStepDefaultFn,
}

export default sendAudioStep
