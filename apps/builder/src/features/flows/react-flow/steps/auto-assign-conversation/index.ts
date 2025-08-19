import {
  autoAssignConversationStepDefaultFn,
  autoAssignConversationStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { AutoAssignConversationStepEditor } from "./editor"
import { AutoAssignConversationStepViewer } from "./viewer"

export const autoAssignConversationStep: StepDefinition = {
  editor: AutoAssignConversationStepEditor,
  viewer: AutoAssignConversationStepViewer,
  validator: autoAssignConversationStepSchema,
  defaultFn: autoAssignConversationStepDefaultFn,
}
