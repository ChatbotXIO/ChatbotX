import {
  unfollowConversationStepDefaultFn,
  unfollowConversationStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { UnfollowConversationStepEditor } from "./editor"
import { UnfollowConversationStepViewer } from "./viewer"

export const unfollowConversationStep: StepDefinition = {
  editor: UnfollowConversationStepEditor,
  viewer: UnfollowConversationStepViewer,
  validator: unfollowConversationStepSchema,
  defaultFn: unfollowConversationStepDefaultFn,
}
