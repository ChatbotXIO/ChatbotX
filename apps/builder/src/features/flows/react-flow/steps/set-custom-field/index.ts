import {
  type SetCustomFieldStepSchema,
  setCustomFieldStepDefaultFn,
  setCustomFieldStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import SetCustomFieldStepEditor from "./editor"
import SetCustomFieldStepViewer from "./viewer"

export const setCustomFieldStep: StepDefinition<SetCustomFieldStepSchema> = {
  editor: SetCustomFieldStepEditor,
  viewer: SetCustomFieldStepViewer,
  validator: setCustomFieldStepSchema,
  defaultFn: setCustomFieldStepDefaultFn,
}
