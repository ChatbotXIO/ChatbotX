import {
  type UnarchiveConversationStepSchema,
  unarchiveConversationStepDefaultFn,
  unarchiveConversationStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import UnarchiveConversationStepEditor from "./editor"
import UnarchiveConversationStepViewer from "./viewer"

export const unarchiveConversationStep: StepDefinition<UnarchiveConversationStepSchema> =
  {
    editor: UnarchiveConversationStepEditor,
    viewer: UnarchiveConversationStepViewer,
    validator: unarchiveConversationStepSchema,
    defaultFn: unarchiveConversationStepDefaultFn,
  }
