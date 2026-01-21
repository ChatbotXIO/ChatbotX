import {
  type GetResponseStepSchema,
  getResponseDefaultFn,
  getResponseStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import GetResponseStepEditor from "./editor"
import GetResponseStepViewer from "./viewer"

export const getResponseStep: StepDefinition<GetResponseStepSchema> = {
  editor: GetResponseStepEditor,
  viewer: GetResponseStepViewer,
  validator: getResponseStepSchema,
  defaultFn: getResponseDefaultFn,
}
