import {
  sendVideoStepDefaultFn,
  sendVideoStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SendVideoStepEditor } from "./editor"
import { SendVideoStepViewer } from "./viewer"

export const sendVideoStep: StepDefinition = {
  editor: SendVideoStepEditor,
  viewer: SendVideoStepViewer,
  validator: sendVideoStepSchema,
  defaultFn: sendVideoStepDefaultFn,
}
