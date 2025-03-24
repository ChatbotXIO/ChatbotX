import type { StepDefinition } from ".."
import { SendVideoStepEditor } from "./editor"
import { sendVideoStepDefaultFn, sendVideoStepSchema } from "./schema"
import { SendVideoStepViewer } from "./viewer"

export const sendVideoStep: StepDefinition = {
  editor: SendVideoStepEditor,
  viewer: SendVideoStepViewer,
  schema: sendVideoStepSchema,
  defaultValue: sendVideoStepDefaultFn,
}
