import {
  type AssignConversationStepSchema,
  assignConversationStepDefaultFn,
  assignConversationStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import AssignConversationStepEditor from "./editor"
import AssignConversationStepViewer from "./viewer"

export const assignConversationStep: StepDefinition<AssignConversationStepSchema> =
  {
    editor: AssignConversationStepEditor,
    viewer: AssignConversationStepViewer,
    validator: assignConversationStepSchema,
    defaultFn: assignConversationStepDefaultFn,
  }
