import { waitStepDefaultFn, waitStepSchema } from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { WaitStepEditor } from "./editor"
import { WaitStepViewer } from "./viewer"

export const waitStep: StepDefinition = {
  editor: WaitStepEditor,
  viewer: WaitStepViewer,
  validator: waitStepSchema,
  defaultFn: waitStepDefaultFn,
}
