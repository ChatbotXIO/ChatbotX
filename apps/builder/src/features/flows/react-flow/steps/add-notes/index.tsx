import {
  type AddNotesStepSchema,
  addNotesNodeSchema,
  addNotesStepDefaultFn,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AddNotesStepEditor from "./editor"
import AddNotesStepViewer from "./viewer"

export const addNotesStep: StepDefinition<AddNotesStepSchema> = {
  editor: AddNotesStepEditor,
  viewer: AddNotesStepViewer,
  validator: addNotesNodeSchema,
  defaultFn: addNotesStepDefaultFn,
}
