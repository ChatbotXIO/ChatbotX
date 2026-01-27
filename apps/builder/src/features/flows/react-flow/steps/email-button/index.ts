import {
  type EmailButtonStepSchema,
  emailButtonStepDefaultFn,
  emailButtonStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailButtonStepEditor from "./editor"
import EmailButtonStepViewer from "./viewer"

const emailButtonStep: StepDefinition<EmailButtonStepSchema> = {
  editor: EmailButtonStepEditor,
  viewer: EmailButtonStepViewer,
  validator: emailButtonStepSchema,
  defaultFn: emailButtonStepDefaultFn,
}

export default emailButtonStep
