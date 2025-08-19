import {
  unarchiveConversationStepDefaultFn,
  unarchiveConversationStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { UnarchiveConversationStepEditor } from "./editor"
import { UnarchiveConversationStepViewer } from "./viewer"

export const unarchiveConversationStep: StepDefinition = {
  editor: UnarchiveConversationStepEditor,
  viewer: UnarchiveConversationStepViewer,
  validator: unarchiveConversationStepSchema,
  defaultFn: unarchiveConversationStepDefaultFn,
}
