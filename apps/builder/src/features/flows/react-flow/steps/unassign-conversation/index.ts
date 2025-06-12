import type { StepDefinition } from ".."
import { UnassignConversationStepEditor } from "./editor"
import {
  unassignConversationStepDefaultFn,
  unassignConversationStepSchema,
} from "@ahachat.ai/flow-config"
import { UnassignConversationStepViewer } from "./viewer"

export const unassignConversationStep: StepDefinition = {
  editor: UnassignConversationStepEditor,
  viewer: UnassignConversationStepViewer,
  validator: unassignConversationStepSchema,
  defaultFn: unassignConversationStepDefaultFn,
}
