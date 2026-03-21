import {
  type ArchiveConversationStepSchema,
  archiveConversationStepDefaultFn,
  archiveConversationStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ArchiveConversationStepEditor from "./editor"
import ArchiveConversationStepViewer from "./viewer"

export const archiveConversationStep: StepDefinition<ArchiveConversationStepSchema> =
  {
    editor: ArchiveConversationStepEditor,
    viewer: ArchiveConversationStepViewer,
    validator: archiveConversationStepSchema,
    defaultFn: archiveConversationStepDefaultFn,
  }
