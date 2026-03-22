import {
  type AddContactTagStepSchema,
  addContactTagStepDefaultFn,
  addContactTagStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AddContactTagStepEditor from "./editor"
import AddContactTagStepViewer from "./viewer"

export const addContactTagStep: StepDefinition<AddContactTagStepSchema> = {
  editor: AddContactTagStepEditor,
  viewer: AddContactTagStepViewer,
  validator: addContactTagStepSchema,
  defaultFn: addContactTagStepDefaultFn,
}
