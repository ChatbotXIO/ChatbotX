import {
  type RemoveContactTagStepSchema,
  removeContactTagStepDefaultFn,
  removeContactTagStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import RemoveContactTagStepEditor from "./editor"
import RemoveContactTagStepViewer from "./viewer"

export const removeContactTagStep: StepDefinition<RemoveContactTagStepSchema> =
  {
    editor: RemoveContactTagStepEditor,
    viewer: RemoveContactTagStepViewer,
    validator: removeContactTagStepSchema,
    defaultFn: removeContactTagStepDefaultFn,
  }
