import type { StepDefinition } from ".."
import { SendAudioStepEditor } from "./editor"
import { sendAudioStepSchema, sendAudioStepDefaultFn } from "./schema"
import { SendAudioStepViewer } from "./viewer"

export const sendAudioStep: StepDefinition = {
  editor: SendAudioStepEditor,
  viewer: SendAudioStepViewer,
  validator: sendAudioStepSchema,
  defaultFn: sendAudioStepDefaultFn,
}
