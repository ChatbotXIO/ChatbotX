import type { StepDefinition } from ".."
import { StartFlowStepEditor } from "./editor"
import {
  startFlowStepDefaultFn,
  startFlowStepSchema,
} from "@ahachat.ai/flow-config"
import { StartFlowStepViewer } from "./viewer"

export const sendVideoStep: StepDefinition = {
  editor: StartFlowStepEditor,
  viewer: StartFlowStepViewer,
  validator: startFlowStepSchema,
  defaultFn: startFlowStepDefaultFn,
}
