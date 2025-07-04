import {
  deleteContactStepDefaultFn,
  deleteContactStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { DeleteContactStepEditor } from "./editor"
import { DeleteContactStepViewer } from "./viewer"

export const deleteContactStep: StepDefinition = {
  editor: DeleteContactStepEditor,
  viewer: DeleteContactStepViewer,
  validator: deleteContactStepSchema,
  defaultFn: deleteContactStepDefaultFn,
}
