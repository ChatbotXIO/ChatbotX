import {
  generateCodeStepDefaultFn,
  generateCodeStepSchema,
} from "@ahachat.ai/flow-config"
import type { StepDefinition } from ".."
import { GenerateCodeStepViewer } from "./viewer"
import GenerateCodeStepEditor from "./editor"

export const generateCodeStep: StepDefinition = {
  editor: GenerateCodeStepEditor,
  viewer: GenerateCodeStepViewer,
  validator: generateCodeStepSchema,
  defaultFn: generateCodeStepDefaultFn,
}
