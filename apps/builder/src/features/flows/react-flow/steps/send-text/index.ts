import type { StepDefinition } from ".."
import SendTextStepEditor from "./editor"
import { sendTextStepDefaultFn, sendTextStepSchema } from "./schema"
import SendTextStepViewer from "./viewer"

const sendTextStep: StepDefinition = {
  editor: SendTextStepEditor,
  viewer: SendTextStepViewer,
  validator: sendTextStepSchema,
  defaultFn: sendTextStepDefaultFn,
}

export default sendTextStep
