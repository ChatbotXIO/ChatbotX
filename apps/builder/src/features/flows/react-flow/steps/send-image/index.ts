import {
  type SendImageStepSchema,
  sendImageStepDefaultFn,
  sendImageStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendImageStepEditor from "./editor"
import SendImageStepViewer from "./viewer"

const sendImageStep: StepDefinition<SendImageStepSchema> = {
  editor: SendImageStepEditor,
  viewer: SendImageStepViewer,
  validator: sendImageStepSchema,
  defaultFn: sendImageStepDefaultFn,
}

export default sendImageStep
