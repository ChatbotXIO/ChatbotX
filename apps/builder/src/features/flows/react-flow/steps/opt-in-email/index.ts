import {
  type OptInEmailStepSchema,
  optInEmailStepDefaultFn,
  optInEmailStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import OptInEmailStepEditor from "./editor"
import OptInEmailStepViewer from "./viewer"

export const optInEmailStep: StepDefinition<OptInEmailStepSchema> = {
  editor: OptInEmailStepEditor,
  viewer: OptInEmailStepViewer,
  validator: optInEmailStepSchema,
  defaultFn: optInEmailStepDefaultFn,
}
