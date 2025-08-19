import {
  generateCodeStepDefaultFn,
  generateCodeStepSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from ".."
import GenerateCodeStepEditor from "./editor"
import { GenerateCodeStepViewer } from "./viewer"

export const generateCodeStep: StepDefinition = {
  editor: GenerateCodeStepEditor,
  viewer: GenerateCodeStepViewer,
  validator: generateCodeStepSchema,
  defaultFn: generateCodeStepDefaultFn,
}
