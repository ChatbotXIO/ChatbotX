import {
  type ThreadControlStepSchema,
  threadControlStepDefaultFn,
  threadControlStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ThreadControlStepEditor from "./editor"
import ThreadControlStepViewer from "./viewer"

export const threadControlStep: StepDefinition<ThreadControlStepSchema> = {
  editor: ThreadControlStepEditor,
  viewer: ThreadControlStepViewer,
  validator: threadControlStepSchema,
  defaultFn: threadControlStepDefaultFn,
}
