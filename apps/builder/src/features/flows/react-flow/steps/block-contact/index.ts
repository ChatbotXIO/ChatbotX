import {
  type BlockContactStepSchema,
  blockContactStepDefaultFn,
  blockContactStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import BlockContactStepEditor from "./editor"
import BlockContactStepViewer from "./viewer"

export const blockContactStep: StepDefinition<BlockContactStepSchema> = {
  editor: BlockContactStepEditor,
  viewer: BlockContactStepViewer,
  validator: blockContactStepSchema,
  defaultFn: blockContactStepDefaultFn,
}
