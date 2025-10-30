import {
  type SendCardStepSchema,
  sendCardStepDefaultFn,
  sendCardStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendCardStepEditor from "./editor"
import SendCardStepViewer from "./viewer"

export const sendCardStep: StepDefinition<SendCardStepSchema> = {
  editor: SendCardStepEditor,
  viewer: SendCardStepViewer,
  validator: sendCardStepSchema,
  defaultFn: sendCardStepDefaultFn,
}
