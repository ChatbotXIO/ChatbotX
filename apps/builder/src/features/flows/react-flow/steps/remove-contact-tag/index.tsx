import {
  removeContactTagStepDefaultFn,
  removeContactTagStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { RemoveContactTagStepEditor } from "./editor"
import { RemoveContactTagStepViewer } from "./viewer"

export const removeContactTagStep: StepDefinition = {
  editor: RemoveContactTagStepEditor,
  viewer: RemoveContactTagStepViewer,
  validator: removeContactTagStepSchema,
  defaultFn: removeContactTagStepDefaultFn,
}
