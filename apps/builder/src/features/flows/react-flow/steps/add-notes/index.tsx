import {
  addNotesNodeSchema,
  addNotesStepDefaultFn,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { AddNotesStepEditor } from "./editor"
import { AddNotesStepViewer } from "./viewer"

export const addNotesStep: StepDefinition = {
  editor: AddNotesStepEditor,
  viewer: AddNotesStepViewer,
  validator: addNotesNodeSchema,
  defaultFn: addNotesStepDefaultFn,
}
