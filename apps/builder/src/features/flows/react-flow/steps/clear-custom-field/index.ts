import {
  type ClearCustomFieldStepSchema,
  clearCustomFieldStepDefaultFn,
  clearCustomFieldStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ClearCustomFieldStepEditor from "./editor"
import ClearCustomFieldStepViewer from "./viewer"

export const clearCustomFieldStep: StepDefinition<ClearCustomFieldStepSchema> =
  {
    editor: ClearCustomFieldStepEditor,
    viewer: ClearCustomFieldStepViewer,
    validator: clearCustomFieldStepSchema,
    defaultFn: clearCustomFieldStepDefaultFn,
  }
