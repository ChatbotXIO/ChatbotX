import {
  type SendGifStepSchema,
  sendGifStepDefaultFn,
  sendGifStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SendGifStepEditor from "./editor"
import { SendGifStepViewer } from "./viewer"

const sendGifStep: StepDefinition<SendGifStepSchema> = {
  editor: SendGifStepEditor,
  viewer: SendGifStepViewer,
  validator: sendGifStepSchema,
  defaultFn: sendGifStepDefaultFn,
}

export default sendGifStep
