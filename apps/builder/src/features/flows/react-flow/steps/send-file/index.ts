import {
  type SendFileStepSchema,
  sendFileStepDefaultFn,
  sendFileStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendFileStepEditor from "./editor"
import SendFileStepViewer from "./viewer"

const sendFileStep: StepDefinition<SendFileStepSchema> = {
  editor: SendFileStepEditor,
  viewer: SendFileStepViewer,
  validator: sendFileStepSchema,
  defaultFn: sendFileStepDefaultFn,
}

export default sendFileStep
