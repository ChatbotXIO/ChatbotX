import type { StepDefinition } from ".."
import {
  sendFlowNodeStepSchema,
  sendFlowNodeStepDefaultFn,
} from "@aha.chat/flow-config"
import SendFlowNodeStepEditor from "./editor"
import SendFlowNodeStepViewer from "./viewer"

const sendMessageNodeStep: StepDefinition = {
  editor: SendFlowNodeStepEditor,
  viewer: SendFlowNodeStepViewer,
  validator: sendFlowNodeStepSchema,
  defaultFn: sendFlowNodeStepDefaultFn,
}

export default sendMessageNodeStep
