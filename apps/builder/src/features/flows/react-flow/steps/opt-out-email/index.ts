import type { StepDefinition } from ".."
import { OptOutEmailStepEditor } from "./editor"
import { optOutEmailStepDefaultFn, optOutEmailStepSchema } from "./schema"
import { OptOutEmailStepViewer } from "./viewer"

export const optOutEmailStep: StepDefinition = {
  editor: OptOutEmailStepEditor,
  viewer: OptOutEmailStepViewer,
  validator: optOutEmailStepSchema,
  defaultFn: optOutEmailStepDefaultFn,
}
