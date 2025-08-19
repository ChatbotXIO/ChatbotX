import {
  sendFlowNodeStepDefaultFn,
  sendFlowNodeStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import SendFlowNodeStepEditor from "./editor"
import SendFlowNodeStepViewer from "./viewer"

const sendMessageNodeStep: StepDefinition = {
  editor: SendFlowNodeStepEditor,
  viewer: SendFlowNodeStepViewer,
  validator: sendFlowNodeStepSchema,
  defaultFn: sendFlowNodeStepDefaultFn,
}

export default sendMessageNodeStep
