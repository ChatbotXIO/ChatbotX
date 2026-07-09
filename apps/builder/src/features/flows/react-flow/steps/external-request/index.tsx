import {
  type ExternalRequestStepSchema,
  externalRequestStepDefaultFn,
  externalRequestStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ExternalRequestStepEditor from "./editor"
import ExternalRequestStepViewer from "./viewer"

export const externalRequestStep: StepDefinition<ExternalRequestStepSchema> = {
  editor: ExternalRequestStepEditor,
  viewer: ExternalRequestStepViewer,
  validator: externalRequestStepSchema,
  defaultFn: externalRequestStepDefaultFn,
}
