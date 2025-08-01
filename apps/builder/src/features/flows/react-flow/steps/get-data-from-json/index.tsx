import {
  getDataFromJsonStepDefaultFn,
  getDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import GetdatafromJsonStepViewer from "./viewer"
import GetDataFromJsonStepEditor from "./editor"

export const getDataFromJsonStep: StepDefinition = {
  editor: GetDataFromJsonStepEditor,
  viewer: GetdatafromJsonStepViewer,
  validator: getDataFromJsonStepSchema,
  defaultFn: getDataFromJsonStepDefaultFn,
}
