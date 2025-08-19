import {
  followConversationStepDefaultFn,
  followConversationStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { FollowConversationStepEditor } from "./editor"
import { FollowConversationStepViewer } from "./viewer"

export const followConversationStep: StepDefinition = {
  editor: FollowConversationStepEditor,
  viewer: FollowConversationStepViewer,
  validator: followConversationStepSchema,
  defaultFn: followConversationStepDefaultFn,
}
