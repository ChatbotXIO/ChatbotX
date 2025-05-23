import type { StepDefinition } from ".."
import { UnarchiveConversationStepEditor } from "./editor"
import {
  unarchiveConversationStepDefaultFn,
  unarchiveConversationStepSchema,
} from "@ahachat.ai/flow-config"
import { UnarchiveConversationStepViewer } from "./viewer"

export const unarchiveConversationStep: StepDefinition = {
  editor: UnarchiveConversationStepEditor,
  viewer: UnarchiveConversationStepViewer,
  validator: unarchiveConversationStepSchema,
  defaultFn: unarchiveConversationStepDefaultFn,
}
