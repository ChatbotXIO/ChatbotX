import {
  type DeleteContactStepSchema,
  deleteContactStepDefaultFn,
  deleteContactStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import DeleteContactStepEditor from "./editor"
import DeleteContactStepViewer from "./viewer"

export const deleteContactStep: StepDefinition<DeleteContactStepSchema> = {
  editor: DeleteContactStepEditor,
  viewer: DeleteContactStepViewer,
  validator: deleteContactStepSchema,
  defaultFn: deleteContactStepDefaultFn,
}
