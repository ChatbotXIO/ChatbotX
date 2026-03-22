import {
  type SplitTrafficStepSchema,
  splitTrafficStepDefaultFn,
  splitTrafficStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SplitTrafficStepEditor from "./editor"
import SplitTrafficStepViewer from "./viewer"

export const splitTrafficStep: StepDefinition<SplitTrafficStepSchema> = {
  editor: SplitTrafficStepEditor,
  viewer: SplitTrafficStepViewer,
  validator: splitTrafficStepSchema,
  defaultFn: splitTrafficStepDefaultFn,
}
