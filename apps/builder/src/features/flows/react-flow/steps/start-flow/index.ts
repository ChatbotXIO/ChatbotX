import type { StepDefinition } from ".."
import { StartFlowStepEditor } from "./editor"
import {
  startFlowStepDefaultFn,
  startFlowStepSchema,
} from "@aha.chat/flow-config"
import { StartFlowStepViewer } from "./viewer"

export const startFlowStep: StepDefinition = {
  editor: StartFlowStepEditor,
  viewer: StartFlowStepViewer,
  validator: startFlowStepSchema,
  defaultFn: startFlowStepDefaultFn,
}
