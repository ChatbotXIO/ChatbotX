import {
  type MailchimpAddMemberSchema,
  mailchimpAddMemberDefaultFn,
  mailchimpAddMemberStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import MailchimpAddMemberStepEditor from "./editor"
import MailchimpAddMemberStepViewer from "./viewer"

export const mailchimpAddMemberStep: StepDefinition<MailchimpAddMemberSchema> =
  {
    editor: MailchimpAddMemberStepEditor,
    viewer: MailchimpAddMemberStepViewer,
    validator: mailchimpAddMemberStepSchema,
    defaultFn: mailchimpAddMemberDefaultFn,
  }
