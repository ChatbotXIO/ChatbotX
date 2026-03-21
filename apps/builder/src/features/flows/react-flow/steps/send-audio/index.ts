import {
  type SendAudioStepSchema,
  sendAudioStepDefaultFn,
  sendAudioStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendAudioStepEditor from "./editor"
import SendAudioStepViewer from "./viewer"

const sendAudioStep: StepDefinition<SendAudioStepSchema> = {
  editor: SendAudioStepEditor,
  viewer: SendAudioStepViewer,
  validator: sendAudioStepSchema,
  defaultFn: sendAudioStepDefaultFn,
}

export default sendAudioStep
