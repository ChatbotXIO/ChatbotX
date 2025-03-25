import type { StepDefinition } from ".."
import { WaitStepEditor } from "./editor"
import { waitStepDefaultFn, waitStepSchema } from "./schema"
import { WaitStepViewer } from "./viewer"

export const waitStep: StepDefinition = {
  editor: WaitStepEditor,
  viewer: WaitStepViewer,
  schema: waitStepSchema,
  defaultValue: waitStepDefaultFn,
}
