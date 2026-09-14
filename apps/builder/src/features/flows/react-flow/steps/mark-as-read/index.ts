import {
  type MarkAsReadStepSchema,
  markAsReadStepDefaultFn,
  markAsReadStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import MarkAsReadStepEditor from "./editor"
import MarkAsReadStepViewer from "./viewer"

const markAsReadStep: StepDefinition<MarkAsReadStepSchema> = {
  editor: MarkAsReadStepEditor,
  viewer: MarkAsReadStepViewer,
  validator: markAsReadStepSchema,
  defaultFn: markAsReadStepDefaultFn,
}

export default markAsReadStep
