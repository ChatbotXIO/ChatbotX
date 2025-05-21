import type { StepDefinition } from ".."
import { WaitStepEditor } from "./editor"
import { waitStepDefaultFn, waitStepSchema } from "@ahachat.ai/flow-config"
import { WaitStepViewer } from "./viewer"

export const waitStep: StepDefinition = {
  editor: WaitStepEditor,
  viewer: WaitStepViewer,
  validator: waitStepSchema,
  defaultFn: waitStepDefaultFn,
}
