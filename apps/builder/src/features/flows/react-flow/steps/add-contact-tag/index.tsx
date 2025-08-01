import {
  addContactTagStepDefaultFn,
  addContactTagStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { addContactTagStepEditor } from "./editor"
import { addContactTagStepViewer } from "./viewer"

export const addContactTagStep: StepDefinition = {
  editor: addContactTagStepEditor,
  viewer: addContactTagStepViewer,
  validator: addContactTagStepSchema,
  defaultFn: addContactTagStepDefaultFn,
}
