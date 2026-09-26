import {
  type MarkConversationAsReadStepSchema,
  markConversationAsReadStepDefaultFn,
  markConversationAsReadStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import MarkConversationAsReadStepEditor from "./editor"
import MarkConversationAsReadStepViewer from "./viewer"

export const markConversationAsReadStep: StepDefinition<MarkConversationAsReadStepSchema> =
  {
    editor: MarkConversationAsReadStepEditor,
    viewer: MarkConversationAsReadStepViewer,
    validator: markConversationAsReadStepSchema,
    defaultFn: markConversationAsReadStepDefaultFn,
  }
