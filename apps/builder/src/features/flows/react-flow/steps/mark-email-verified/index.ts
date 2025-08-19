import {
  markEmailVerifiedStepDefaultFn,
  markEmailVerifiedStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import { MarkEmailVerifiedStepEditor } from "./editor"
import { MarkEmailVerifiedStepViewer } from "./viewer"

export const markEmailVerifiedStep: StepDefinition = {
  editor: MarkEmailVerifiedStepEditor,
  viewer: MarkEmailVerifiedStepViewer,
  validator: markEmailVerifiedStepSchema,
  defaultFn: markEmailVerifiedStepDefaultFn,
}
