import type { StepDefinition } from ".."
import { SendCardStepEditor } from "./editor"
import {
  sendCardStepSchema,
  sendCardStepDefaultFn,
} from "@ahachat.ai/flow-config"
import { SendCardStepViewer } from "./viewer"

export const sendCardStep: StepDefinition = {
  editor: SendCardStepEditor,
  viewer: SendCardStepViewer,
  validator: sendCardStepSchema,
  defaultFn: sendCardStepDefaultFn,
}
