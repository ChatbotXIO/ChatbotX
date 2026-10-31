import {
  type CallPhoneNumberStepSchema,
  callPhoneNumberStepDefaultFn,
  callPhoneNumberStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import CallPhoneNumberStepEditor from "./editor"
import CallPhoneNumberStepViewer from "./viewer"

export const callPhoneNumberStep: StepDefinition<CallPhoneNumberStepSchema> = {
  editor: CallPhoneNumberStepEditor,
  viewer: CallPhoneNumberStepViewer,
  validator: callPhoneNumberStepSchema,
  defaultFn: callPhoneNumberStepDefaultFn,
}
