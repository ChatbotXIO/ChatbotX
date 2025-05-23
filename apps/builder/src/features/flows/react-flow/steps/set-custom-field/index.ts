import {
  setCustomFieldStepDefaultFn,
  setCustomFieldStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { SetCustomFieldStepEditor } from "./editor"
import { SetCustomFieldStepViewer } from "./viewer"

export const setCustomFieldStep: StepDefinition = {
  editor: SetCustomFieldStepEditor,
  viewer: SetCustomFieldStepViewer,
  validator: setCustomFieldStepSchema,
  defaultFn: setCustomFieldStepDefaultFn,
}
