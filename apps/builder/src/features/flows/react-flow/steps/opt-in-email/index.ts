import type { StepDefinition } from ".."
import { OptInEmailStepEditor } from "./editor"
import { optInEmailStepDefaultFn, optInEmailStepSchema } from "./schema"
import { OptInEmailStepViewer } from "./viewer"

export const optInEmailStep: StepDefinition = {
  editor: OptInEmailStepEditor,
  viewer: OptInEmailStepViewer,
  validator: optInEmailStepSchema,
  defaultFn: optInEmailStepDefaultFn,
}
