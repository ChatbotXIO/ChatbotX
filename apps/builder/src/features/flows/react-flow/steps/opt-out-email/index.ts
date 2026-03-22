import {
  type OptOutEmailStepSchema,
  optOutEmailStepDefaultFn,
  optOutEmailStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import OptOutEmailStepEditor from "./editor"
import OptOutEmailStepViewer from "./viewer"

export const optOutEmailStep: StepDefinition<OptOutEmailStepSchema> = {
  editor: OptOutEmailStepEditor,
  viewer: OptOutEmailStepViewer,
  validator: optOutEmailStepSchema,
  defaultFn: optOutEmailStepDefaultFn,
}
