import {
  type StartExternalFlowStepSchema,
  startExternalFlowStepDefaultFn,
  startExternalFlowStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendExternalFlowStepEditor from "./editor"
import SendExternalFlowStepViewer from "./viewer"

export const sendExternalFlowStep: StepDefinition<StartExternalFlowStepSchema> =
  {
    editor: SendExternalFlowStepEditor,
    viewer: SendExternalFlowStepViewer,
    validator: startExternalFlowStepSchema,
    defaultFn: startExternalFlowStepDefaultFn,
  }
