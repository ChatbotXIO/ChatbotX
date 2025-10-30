import {
  type FollowConversationStepSchema,
  followConversationStepDefaultFn,
  followConversationStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import FollowConversationStepEditor from "./editor"
import FollowConversationStepViewer from "./viewer"

export const followConversationStep: StepDefinition<FollowConversationStepSchema> =
  {
    editor: FollowConversationStepEditor,
    viewer: FollowConversationStepViewer,
    validator: followConversationStepSchema,
    defaultFn: followConversationStepDefaultFn,
  }
