import type { StepDefinition } from ".."
import { FollowConversationStepEditor } from "./editor"
import { FollowConversationStepViewer } from "./viewer"
import {
  followConversationStepDefaultFn,
  followConversationStepSchema,
} from "@ahachat.ai/flow-config"

export const followConversationStep: StepDefinition = {
  editor: FollowConversationStepEditor,
  viewer: FollowConversationStepViewer,
  validator: followConversationStepSchema,
  defaultFn: followConversationStepDefaultFn,
}
