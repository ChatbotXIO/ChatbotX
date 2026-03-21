import {
  type GetDataFromJsonStepSchema,
  getDataFromJsonStepDefaultFn,
  getDataFromJsonStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import GetDataFromJsonStepEditor from "./editor"
import GetdatafromJsonStepViewer from "./viewer"

export const getDataFromJsonStep: StepDefinition<GetDataFromJsonStepSchema> = {
  editor: GetDataFromJsonStepEditor,
  viewer: GetdatafromJsonStepViewer,
  validator: getDataFromJsonStepSchema,
  defaultFn: getDataFromJsonStepDefaultFn,
}
