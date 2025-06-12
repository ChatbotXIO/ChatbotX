import {
  clearCustomFieldStepDefaultFn,
  clearCustomFieldStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { ClearCustomFieldStepEditor } from "./editor"
import { ClearCustomFieldStepViewer } from "./viewer"

export const clearCustomFieldStep: StepDefinition = {
  editor: ClearCustomFieldStepEditor,
  viewer: ClearCustomFieldStepViewer,
  validator: clearCustomFieldStepSchema,
  defaultFn: clearCustomFieldStepDefaultFn,
}
