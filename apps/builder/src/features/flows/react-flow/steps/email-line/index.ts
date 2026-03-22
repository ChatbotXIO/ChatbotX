import {
  type EmailLineStepSchema,
  emailLineStepDefaultFn,
  emailLineStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailLineStepEditor from "./editor"
import EmailLineStepViewer from "./viewer"

const emailLineStep: StepDefinition<EmailLineStepSchema> = {
  editor: EmailLineStepEditor,
  viewer: EmailLineStepViewer,
  validator: emailLineStepSchema,
  defaultFn: emailLineStepDefaultFn,
}

export default emailLineStep
