import {
  type EmailSpacingStepSchema,
  emailSpacingStepDefaultFn,
  emailSpacingStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailSpacingStepEditor from "./editor"
import EmailSpacingStepViewer from "./viewer"

const emailSpacingStep: StepDefinition<EmailSpacingStepSchema> = {
  editor: EmailSpacingStepEditor,
  viewer: EmailSpacingStepViewer,
  validator: emailSpacingStepSchema,
  defaultFn: emailSpacingStepDefaultFn,
}

export default emailSpacingStep
