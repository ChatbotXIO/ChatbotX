import type { StepDefinition } from ".."
import PerformActionStepEditor from "./editor"
import { performActionStepDefaultFn, performActionStepSchema } from "./schema"
import PerformActionStepViewer from "./viewer"

const performActionStep: StepDefinition = {
  editor: PerformActionStepEditor,
  viewer: PerformActionStepViewer,
  validator: performActionStepSchema,
  defaultFn: performActionStepDefaultFn,
}

export default performActionStep
