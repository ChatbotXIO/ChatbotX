import {
  type EmailTextStepSchema,
  emailTextStepDefaultFn,
  emailTextStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailTextStepEditor from "./editor"
import EmailTextStepViewer from "./viewer"

const emailTextStep: StepDefinition<EmailTextStepSchema> = {
  editor: EmailTextStepEditor,
  viewer: EmailTextStepViewer,
  validator: emailTextStepSchema,
  defaultFn: emailTextStepDefaultFn,
}

export default emailTextStep
