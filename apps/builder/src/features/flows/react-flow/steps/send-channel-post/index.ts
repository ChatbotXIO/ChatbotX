import {
  type SendChannelPostStepSchema,
  sendChannelPostStepDefaultFn,
  sendChannelPostValidator,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendChannelPostStepEditor from "./editor"
import SendChannelPostStepViewer from "./viewer"

const sendChannelPostStep: StepDefinition<SendChannelPostStepSchema> = {
  editor: SendChannelPostStepEditor,
  viewer: SendChannelPostStepViewer,
  validator: sendChannelPostValidator,
  defaultFn: sendChannelPostStepDefaultFn,
}

export default sendChannelPostStep
