import {
  type ConditionStepSchema,
  conditionStepDefaultFn,
  conditionStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ConditionStepEditor from "./editor"
import ConditionStepViewer from "./viewer"

export const conditionStep: StepDefinition<ConditionStepSchema> = {
  editor: ConditionStepEditor,
  viewer: ConditionStepViewer,
  validator: conditionStepSchema,
  defaultFn: conditionStepDefaultFn,
}
