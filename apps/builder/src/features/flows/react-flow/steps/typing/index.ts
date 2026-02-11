import {
  type TypingStepSchema,
  typingStepDefaultFn,
  typingStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import TypingStepEditor from "./editor"
import TypingStepViewer from "./viewer"

const typingStep: StepDefinition<TypingStepSchema> = {
  editor: TypingStepEditor,
  viewer: TypingStepViewer,
  validator: typingStepSchema,
  defaultFn: typingStepDefaultFn,
}

export default typingStep
