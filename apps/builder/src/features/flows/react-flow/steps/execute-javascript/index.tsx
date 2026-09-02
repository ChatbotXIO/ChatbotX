import {
  type ExecuteJavascriptStepSchema,
  executeJavascriptStepDefaultFn,
  executeJavascriptStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import ExecuteJavascriptStepEditor from "./editor"
import ExecuteJavascriptStepViewer from "./viewer"

export const executeJavascriptStep: StepDefinition<ExecuteJavascriptStepSchema> =
  {
    editor: ExecuteJavascriptStepEditor,
    viewer: ExecuteJavascriptStepViewer,
    validator: executeJavascriptStepSchema,
    defaultFn: executeJavascriptStepDefaultFn,
  }
