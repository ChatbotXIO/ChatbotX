import type { StepDefinition } from ".."
import { BlockContactStepEditor } from "./editor"
import { BlockContactStepViewer } from "./viewer"
import {
  blockContactStepDefaultFn,
  blockContactStepSchema,
} from "@aha.chat/flow-config"

export const blockContactStep: StepDefinition = {
  editor: BlockContactStepEditor,
  viewer: BlockContactStepViewer,
  validator: blockContactStepSchema,
  defaultFn: blockContactStepDefaultFn,
}
