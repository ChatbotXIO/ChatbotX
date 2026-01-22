import {
  type SendFoxStepSchema,
  sendFoxDefaultFn,
  sendFoxStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendFoxStepEditor from "./editor"
import SendFoxStepViewer from "./viewer"

export const sendFoxStep: StepDefinition<SendFoxStepSchema> = {
  editor: SendFoxStepEditor,
  viewer: SendFoxStepViewer,
  validator: sendFoxStepSchema,
  defaultFn: sendFoxDefaultFn,
}
