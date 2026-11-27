import {
  type CopyTextStepSchema,
  copyTextStepDefaultFn,
  copyTextStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import CopyTextStepEditor from "./editor"
import CopyTextStepViewer from "./viewer"

export const copyTextStep: StepDefinition<CopyTextStepSchema> = {
  editor: CopyTextStepEditor,
  viewer: CopyTextStepViewer,
  validator: copyTextStepSchema,
  defaultFn: copyTextStepDefaultFn,
}
