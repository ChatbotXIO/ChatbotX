import {
  type StartAnotherNodeStepSchema,
  startAnotherNodeStepDefaultFn,
  startAnotherNodeStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import StartAnotherNodeStepEditor from "./editor"
import SendNodeStepViewer from "./viewer"

const startAnotherNodeStep: StepDefinition<StartAnotherNodeStepSchema> = {
  editor: StartAnotherNodeStepEditor,
  viewer: SendNodeStepViewer,
  validator: startAnotherNodeStepSchema,
  defaultFn: startAnotherNodeStepDefaultFn,
}

export default startAnotherNodeStep
