import {
  type MarkConversationAsUnreadStepSchema,
  markConversationAsUnreadStepDefaultFn,
  markConversationAsUnreadStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import MarkConversationAsUnreadStepEditor from "./editor"
import MarkConversationAsUnreadStepViewer from "./viewer"

export const markConversationAsUnreadStep: StepDefinition<MarkConversationAsUnreadStepSchema> =
  {
    editor: MarkConversationAsUnreadStepEditor,
    viewer: MarkConversationAsUnreadStepViewer,
    validator: markConversationAsUnreadStepSchema,
    defaultFn: markConversationAsUnreadStepDefaultFn,
  }
