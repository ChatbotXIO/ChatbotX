import {
  unassignConversationStepDefaultFn,
  unassignConversationStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { UnassignConversationStepEditor } from "./editor"
import { UnassignConversationStepViewer } from "./viewer"

export const unassignConversationStep: StepDefinition = {
  editor: UnassignConversationStepEditor,
  viewer: UnassignConversationStepViewer,
  validator: unassignConversationStepSchema,
  defaultFn: unassignConversationStepDefaultFn,
}
