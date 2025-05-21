import type { StepDefinition } from ".."
import { MarkEmailVerifiedStepEditor } from "./editor"
import { MarkEmailVerifiedStepViewer } from "./viewer"
import {
  markEmailVerifiedStepDefaultFn,
  markEmailVerifiedStepSchema,
} from "@ahachat.ai/flow-config"

export const markEmailVerifiedStep: StepDefinition = {
  editor: MarkEmailVerifiedStepEditor,
  viewer: MarkEmailVerifiedStepViewer,
  validator: markEmailVerifiedStepSchema,
  defaultFn: markEmailVerifiedStepDefaultFn,
}
