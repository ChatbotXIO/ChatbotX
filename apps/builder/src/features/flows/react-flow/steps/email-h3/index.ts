import {
  type EmailH3StepSchema,
  emailH3StepDefaultFn,
  emailH3StepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import EmailH3StepEditor from "./editor"
import EmailH3StepViewer from "./viewer"

const emailH3Step: StepDefinition<EmailH3StepSchema> = {
  editor: EmailH3StepEditor,
  viewer: EmailH3StepViewer,
  validator: emailH3StepSchema,
  defaultFn: emailH3StepDefaultFn,
}

export default emailH3Step
