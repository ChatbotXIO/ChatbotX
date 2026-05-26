import {
  type UpdateContactLifecycleStageStepSchema,
  updateContactLifecycleStageStepDefaultFn,
  updateContactLifecycleStageStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import UpdateContactLifecycleStageStepEditor from "./editor"
import UpdateContactLifecycleStageStepViewer from "./viewer"

export const updateContactLifecycleStageStep: StepDefinition<UpdateContactLifecycleStageStepSchema> =
  {
    editor: UpdateContactLifecycleStageStepEditor,
    viewer: UpdateContactLifecycleStageStepViewer,
    validator: updateContactLifecycleStageStepSchema,
    defaultFn: updateContactLifecycleStageStepDefaultFn,
  }
