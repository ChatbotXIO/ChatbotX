import type { StepDefinition } from ".."
import { SendImageStepEditor } from "./editor"
import {
  sendImageStepSchema,
  sendImageStepDefaultFn,
} from "@aha.chat/flow-config"
import { SendImageStepViewer } from "./viewer"

const sendImageStep: StepDefinition = {
  editor: SendImageStepEditor,
  viewer: SendImageStepViewer,
  validator: sendImageStepSchema,
  defaultFn: sendImageStepDefaultFn,
}

export default sendImageStep
