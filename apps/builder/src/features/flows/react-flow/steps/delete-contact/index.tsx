import {
  deleteContactStepDefaultFn,
  deleteContactStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { DeleteContactStepEditor } from "./editor"
import { DeleteContactStepViewer } from "./viewer"

export const deleteContactStep: StepDefinition = {
  editor: DeleteContactStepEditor,
  viewer: DeleteContactStepViewer,
  validator: deleteContactStepSchema,
  defaultFn: deleteContactStepDefaultFn,
}
