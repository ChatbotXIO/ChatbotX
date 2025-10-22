import {
  type StartExternalNodeStepSchema,
  startExternalNodeStepDefaultFn,
  startExternalNodeStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import StartExternalNodeStepEditor from "./editor"
import StartExternalNodeStepViewer from "./viewer"

export const sendExternalNodeStep: StepDefinition<StartExternalNodeStepSchema> =
  {
    editor: StartExternalNodeStepEditor,
    viewer: StartExternalNodeStepViewer,
    validator: startExternalNodeStepSchema,
    defaultFn: startExternalNodeStepDefaultFn,
  }
