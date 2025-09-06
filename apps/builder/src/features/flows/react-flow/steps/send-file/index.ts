import {
  sendFileStepDefaultFn,
  sendFileStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { SendFileStepEditor } from "./editor"
import { SendFileStepViewer } from "./viewer"

export const sendFileStep: StepDefinition = {
  editor: SendFileStepEditor,
  viewer: SendFileStepViewer,
  validator: sendFileStepSchema,
  defaultFn: sendFileStepDefaultFn,
}

export default sendFileStep
