import {
  type TriggerN8nStepSchema,
  triggerN8nStepDefaultFn,
  triggerN8nStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import TriggerN8nStepEditor from "./editor"
import TriggerN8nStepViewer from "./viewer"

export const triggerN8nStep: StepDefinition<TriggerN8nStepSchema> = {
  editor: TriggerN8nStepEditor,
  viewer: TriggerN8nStepViewer,
  validator: triggerN8nStepSchema,
  defaultFn: triggerN8nStepDefaultFn,
}
