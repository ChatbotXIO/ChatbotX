import {
  performActionStepDefaultFn,
  performActionStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import PerformActionStepEditor from "./editor"
import PerformActionStepViewer from "./viewer"

const performActionStep: StepDefinition = {
  editor: PerformActionStepEditor,
  viewer: PerformActionStepViewer,
  validator: performActionStepSchema,
  defaultFn: performActionStepDefaultFn,
}

export default performActionStep
