import {
  type UnfollowConversationStepSchema,
  unfollowConversationStepDefaultFn,
  unfollowConversationStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import UnfollowConversationStepEditor from "./editor"
import UnfollowConversationStepViewer from "./viewer"

export const unfollowConversationStep: StepDefinition<UnfollowConversationStepSchema> =
  {
    editor: UnfollowConversationStepEditor,
    viewer: UnfollowConversationStepViewer,
    validator: unfollowConversationStepSchema,
    defaultFn: unfollowConversationStepDefaultFn,
  }
