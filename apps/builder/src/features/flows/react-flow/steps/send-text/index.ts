import {
  sendTextStepDefaultFn,
  sendTextStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import SendTextStepEditor from "./editor"
import SendTextStepViewer from "./viewer"

const sendTextStep: StepDefinition = {
  editor: SendTextStepEditor,
  viewer: SendTextStepViewer,
  validator: sendTextStepSchema,
  defaultFn: sendTextStepDefaultFn,
}

export default sendTextStep
