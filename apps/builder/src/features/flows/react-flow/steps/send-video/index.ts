import type { StepDefinition } from ".."
import { SendVideoStepEditor } from "./editor"
import {
  sendVideoStepDefaultFn,
  sendVideoStepSchema,
} from "@ahachat.ai/flow-config"
import { SendVideoStepViewer } from "./viewer"

export const sendVideoStep: StepDefinition = {
  editor: SendVideoStepEditor,
  viewer: SendVideoStepViewer,
  validator: sendVideoStepSchema,
  defaultFn: sendVideoStepDefaultFn,
}
