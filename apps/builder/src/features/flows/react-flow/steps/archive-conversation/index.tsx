import {
  archiveConversationStepDefaultFn,
  archiveConversationStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { ArchiveConversationStepEditor } from "./editor"
import { ArchiveConversationStepViewer } from "./viewer"

export const archiveConversationStep: StepDefinition = {
  editor: ArchiveConversationStepEditor,
  viewer: ArchiveConversationStepViewer,
  validator: archiveConversationStepSchema,
  defaultFn: archiveConversationStepDefaultFn,
}
