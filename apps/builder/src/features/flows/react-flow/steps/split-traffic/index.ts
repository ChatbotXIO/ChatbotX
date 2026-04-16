import {
  type SplitTrafficStepSchema,
  splitTrafficStepDefaultFn,
  splitTrafficStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SplitTrafficStepEditor from "./editor"
import SplitTrafficStepViewer from "./viewer"

const splitTrafficStep: StepDefinition<SplitTrafficStepSchema> = {
  editor: SplitTrafficStepEditor,
  viewer: SplitTrafficStepViewer,
  validator: splitTrafficStepSchema,
  defaultFn: splitTrafficStepDefaultFn,
}

export default splitTrafficStep
