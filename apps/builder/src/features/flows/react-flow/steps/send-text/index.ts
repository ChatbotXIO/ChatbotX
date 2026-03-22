import {
  type SendTextStepSchema,
  sendTextStepDefaultFn,
  sendTextStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendTextStepEditor from "./editor"
import SendTextStepViewer from "./viewer"

const sendTextStep: StepDefinition<SendTextStepSchema> = {
  editor: SendTextStepEditor,
  viewer: SendTextStepViewer,
  validator: sendTextStepSchema,
  defaultFn: sendTextStepDefaultFn,
}

export default sendTextStep
