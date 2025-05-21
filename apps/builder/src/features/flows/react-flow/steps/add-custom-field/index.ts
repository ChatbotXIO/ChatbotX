import {
  addCustomFieldStepDefaultFn,
  addCustomFieldStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { AddCustomFieldStepEditor } from "./editor"
import { AddCustomFieldStepViewer } from "./viewer"

export const addCustomFieldStep: StepDefinition = {
  editor: AddCustomFieldStepEditor,
  viewer: AddCustomFieldStepViewer,
  validator: addCustomFieldStepSchema,
  defaultFn: addCustomFieldStepDefaultFn,
}
