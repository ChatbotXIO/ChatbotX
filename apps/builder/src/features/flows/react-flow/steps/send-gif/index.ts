import { sendGifStepDefaultFn, sendGifStepSchema } from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import SendGifStepEditor from "./editor"
import { SendGifStepViewer } from "./viewer"

const sendGifStep: StepDefinition = {
  editor: SendGifStepEditor,
  viewer: SendGifStepViewer,
  validator: sendGifStepSchema,
  defaultFn: sendGifStepDefaultFn,
}

export default sendGifStep
