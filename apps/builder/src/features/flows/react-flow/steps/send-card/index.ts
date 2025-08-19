import {
  sendCardStepDefaultFn,
  sendCardStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SendCardStepEditor } from "./editor"
import { SendCardStepViewer } from "./viewer"

export const sendCardStep: StepDefinition = {
  editor: SendCardStepEditor,
  viewer: SendCardStepViewer,
  validator: sendCardStepSchema,
  defaultFn: sendCardStepDefaultFn,
}
