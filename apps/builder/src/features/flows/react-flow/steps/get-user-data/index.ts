import {
  type GetUserDataStepSchema,
  getUserDataStepDefaultFn,
  getUserDataStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import GetUserDataStepEditor from "./editor"
import GetUserDataStepViewer from "./viewer"

export const getUserDataStep: StepDefinition<GetUserDataStepSchema> = {
  editor: GetUserDataStepEditor,
  viewer: GetUserDataStepViewer,
  validator: getUserDataStepSchema,
  defaultFn: getUserDataStepDefaultFn,
}
