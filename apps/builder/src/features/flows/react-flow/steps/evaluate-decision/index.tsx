import {
  type EvaluateDecisionStepSchema,
  evaluateDecisionStepDefaultFn,
  evaluateDecisionStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import EvaluateDecisionStepEditor from "./editor"
import EvaluateDecisionStepViewer from "./viewer"

export const evaluateDecisionStep: StepDefinition<EvaluateDecisionStepSchema> =
  {
    defaultFn: evaluateDecisionStepDefaultFn,
    editor: EvaluateDecisionStepEditor,
    validator: evaluateDecisionStepSchema,
    viewer: EvaluateDecisionStepViewer,
  }
