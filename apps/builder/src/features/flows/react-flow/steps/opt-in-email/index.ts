import {
  optInEmailStepDefaultFn,
  optInEmailStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OptInEmailStepEditor } from "./editor"
import { OptInEmailStepViewer } from "./viewer"

export const optInEmailStep: StepDefinition = {
  editor: OptInEmailStepEditor,
  viewer: OptInEmailStepViewer,
  validator: optInEmailStepSchema,
  defaultFn: optInEmailStepDefaultFn,
}
