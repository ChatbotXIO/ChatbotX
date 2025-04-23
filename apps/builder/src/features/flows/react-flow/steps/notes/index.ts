import type { StepDefinition } from ".."
import { MarkEmailVerifiedStepEditor } from "./editor"
import {
  markEmailVerifiedStepDefaultFn,
  markEmailVerifiedStepSchema,
} from "./schema"
import { MarkEmailVerifiedStepViewer } from "./viewer"

export const markEmailVerifiedStep: StepDefinition = {
  editor: MarkEmailVerifiedStepEditor,
  viewer: MarkEmailVerifiedStepViewer,
  validator: markEmailVerifiedStepSchema,
  defaultFn: markEmailVerifiedStepDefaultFn,
}
