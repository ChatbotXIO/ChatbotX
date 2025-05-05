import type { StepDefinition } from ".."
import SendMessageNodeStepEditor from "./editor"
import {
  sendMessageNodeStepDefaultFn,
  sendMessageNodeStepSchema,
} from "./schema"
import SendMessageNodeStepViewer from "./viewer"

const sendMessageNodeStep: StepDefinition = {
  editor: SendMessageNodeStepEditor,
  viewer: SendMessageNodeStepViewer,
  validator: sendMessageNodeStepSchema,
  defaultFn: sendMessageNodeStepDefaultFn,
}

export default sendMessageNodeStep
