import {
  getDataFromJsonStepDefaultFn,
  getDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import GetDataFromJsonStepEditor from "./editor"
import GetdatafromJsonStepViewer from "./viewer"

export const getDataFromJsonStep: StepDefinition = {
  editor: GetDataFromJsonStepEditor,
  viewer: GetdatafromJsonStepViewer,
  validator: getDataFromJsonStepSchema,
  defaultFn: getDataFromJsonStepDefaultFn,
}
