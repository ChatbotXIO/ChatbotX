import {
  type MailerLiteStepSchema,
  mailerLiteDefaultFn,
  mailerLiteStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import MailerLiteStepEditor from "./editor"
import MailerLiteStepViewer from "./viewer"

export const mailerLiteStep: StepDefinition<MailerLiteStepSchema> = {
  editor: MailerLiteStepEditor,
  viewer: MailerLiteStepViewer,
  validator: mailerLiteStepSchema,
  defaultFn: mailerLiteDefaultFn,
}
