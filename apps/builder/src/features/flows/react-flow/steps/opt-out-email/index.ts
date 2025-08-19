import {
  optOutEmailStepDefaultFn,
  optOutEmailStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { OptOutEmailStepEditor } from "./editor"
import { OptOutEmailStepViewer } from "./viewer"

export const optOutEmailStep: StepDefinition = {
  editor: OptOutEmailStepEditor,
  viewer: OptOutEmailStepViewer,
  validator: optOutEmailStepSchema,
  defaultFn: optOutEmailStepDefaultFn,
}
