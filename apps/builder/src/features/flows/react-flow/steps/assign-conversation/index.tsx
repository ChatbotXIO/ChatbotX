import {
  assignConversationStepDefaultFn,
  assignConversationStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { AssignConversationStepEditor } from "./editor"
import { AssignConversationStepViewer } from "./viewer"

export const assignConversationStep: StepDefinition = {
  editor: AssignConversationStepEditor,
  viewer: AssignConversationStepViewer,
  validator: assignConversationStepSchema,
  defaultFn: assignConversationStepDefaultFn,
}
