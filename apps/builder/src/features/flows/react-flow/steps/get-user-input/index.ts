import {
  type GetUserInputStepSchema,
  getUserInputStepDefaultFn,
  getUserInputStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import GetUserInputStepEditor from "./editor"
import GetUserInputStepViewer from "./viewer"

export const waitUserReplyStep: StepDefinition<GetUserInputStepSchema> = {
  editor: GetUserInputStepEditor,
  viewer: GetUserInputStepViewer,
  validator: getUserInputStepSchema,
  defaultFn: getUserInputStepDefaultFn,
}
