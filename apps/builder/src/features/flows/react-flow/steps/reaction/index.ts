import {
  type ReactionStepSchema,
  reactionStepDefaultFn,
  reactionStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ReactionStepEditor from "./editor"
import ReactionStepViewer from "./viewer"

const reactionStep: StepDefinition<ReactionStepSchema> = {
  editor: ReactionStepEditor,
  viewer: ReactionStepViewer,
  validator: reactionStepSchema,
  defaultFn: reactionStepDefaultFn,
}

export default reactionStep
