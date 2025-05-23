import type { StepDefinition } from ".."
import { AutoAssignConversationStepEditor } from "./editor"
import { AutoAssignConversationStepViewer } from "./viewer"
import {
  autoAssignConversationStepDefaultFn,
  autoAssignConversationStepSchema,
} from "@ahachat.ai/flow-config"

export const autoAssignConversationStep: StepDefinition = {
  editor: AutoAssignConversationStepEditor,
  viewer: AutoAssignConversationStepViewer,
  validator: autoAssignConversationStepSchema,
  defaultFn: autoAssignConversationStepDefaultFn,
}
